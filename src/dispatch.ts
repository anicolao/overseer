import * as fs from "node:fs";
import { DeveloperTesterPersona } from "./personas/developer_tester.js";
import { OverseerPersona } from "./personas/overseer.js";
import { PlannerPersona } from "./personas/planner.js";
import { ProductArchitectPersona } from "./personas/product_architect.js";
import { QualityPersona } from "./personas/quality.js";
import type { IterationResult } from "./utils/agent_runner.js";
import { GeminiService } from "./utils/gemini.js";
import { GitHubService } from "./utils/github.js";
import { PersistenceService } from "./utils/persistence.js";
import {
	getAttribution,
	hasExplicitPersonaMention,
} from "./utils/persona_helper.js";
import { truncate } from "./utils/text.js";
import {
	logTrace,
	makeTraceId,
	runWithTraceContext,
	type TraceContext,
	textStats,
} from "./utils/trace.js";

function appendGithubOutput(key: string, value: string): void {
	const outputPath = process.env.GITHUB_OUTPUT;
	if (!outputPath) {
		return;
	}
	fs.appendFileSync(outputPath, `${key}=${value}\n`);
}

async function run() {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath) throw new Error("GITHUB_EVENT_PATH not found");

	const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
	const eventName = process.env.GITHUB_EVENT_NAME;

	const geminiApiKey = process.env.GEMINI_API_KEY || "";
	const githubToken = process.env.GITHUB_TOKEN || "";

	const gemini = new GeminiService(geminiApiKey);
	const github = new GitHubService(githubToken);
	const persistence = new PersistenceService();

	const personas = {
		overseer: new OverseerPersona(gemini, github),
		productArchitect: new ProductArchitectPersona(gemini, github, persistence),
		planner: new PlannerPersona(gemini, github, persistence),
		developerTester: new DeveloperTesterPersona(gemini, github, persistence),
		quality: new QualityPersona(gemini, github),
	};

	const sender = eventData.sender?.login;
	const botUser = "anicolao"; // The identity used by OVERSEER_TOKEN
	logTrace("dispatcher.start", {
		eventName,
		sender,
		runId: process.env.GITHUB_RUN_ID,
		nodeVersion: process.version,
		hasGeminiApiKey: geminiApiKey.length > 0,
		hasGithubToken: githubToken.length > 0,
	});
	appendGithubOutput("persona_executed", "false");
	appendGithubOutput("executed_persona", "");

	console.log(`Received GitHub event: ${eventName} from ${sender}`);

	let issueNumber: number;
	let owner: string;
	let repo: string;

	if (eventName === "issues") {
		issueNumber = eventData.issue.number;
		owner = eventData.repository.owner.login;
		repo = eventData.repository.name;
	} else if (eventName === "issue_comment") {
		issueNumber = eventData.issue.number;
		owner = eventData.repository.owner.login;
		repo = eventData.repository.name;
	} else {
		console.log(`Ignoring event type: ${eventName}`);
		return;
	}

	if (eventName === "issues" && eventData.action === "opened") {
		const issueText = `${eventData.issue.title || ""}\n${eventData.issue.body || ""}`;
		if (!hasExplicitPersonaMention(issueText, "@overseer")) {
			logTrace("dispatcher.issueOpen.skippedWithoutMention", {
				title: textStats(eventData.issue.title || ""),
				body: textStats(eventData.issue.body || ""),
			});
			console.log(
				"Skipping issue-open dispatch because the issue does not explicitly mention @overseer",
			);
			return;
		}
	}

	const branchState = await persistence.ensureIssueBranch(issueNumber);
	logTrace("dispatcher.issueBranch.ready", {
		branchName: branchState.branchName,
		created: branchState.created,
	});

	const labels = await github.getIssueLabels(owner, repo, issueNumber);
	const activePersonaLabel = labels.find((l) =>
		l.startsWith("active-persona:"),
	);
	const activePersona = activePersonaLabel
		? activePersonaLabel.split(":")[1]
		: null;

	console.log(`Active persona from label: ${activePersona}`);

	const handleMap: Record<string, string> = {
		"@overseer": "overseer",
		"@product-architect": "product-architect",
		"@planner": "planner",
		"@developer-tester": "developer-tester",
		"@quality": "quality",
	};

	const personaNameMap: Record<string, string> = {
		overseer: "Overseer",
		"product-architect": "Product/Architect",
		planner: "Planner",
		"developer-tester": "Developer/Tester",
		quality: "Quality",
	};

	let iterationResult: IterationResult | null = null;
	let executedPersona: string | null = null;
	let commentUrl: string | undefined;
	let senderPersona: string | undefined;
	let traceContext: TraceContext | undefined;

	if (eventName === "issues" && eventData.action === "opened") {
		executedPersona = "overseer";
		appendGithubOutput("persona_executed", "true");
		appendGithubOutput("executed_persona", executedPersona);
		traceContext = {
			traceId: makeTraceId({
				runId: process.env.GITHUB_RUN_ID,
				persona: executedPersona,
				issueNumber,
			}),
			persona: executedPersona,
			owner,
			repo,
			issueNumber,
			runId: process.env.GITHUB_RUN_ID,
			eventName,
			sender,
		};
		iterationResult = await runWithTraceContext(traceContext, async () => {
			logTrace("dispatcher.persona.dispatch", {
				trigger: "issues.opened",
				title: textStats(eventData.issue.title),
				body: textStats(eventData.issue.body || ""),
			});
			return personas.overseer.handleNewIssue(
				owner,
				repo,
				issueNumber,
				eventData.issue.title,
				eventData.issue.body || "",
			);
		});
	} else if (eventName === "issue_comment" && eventData.action === "created") {
		const body = eventData.comment.body as string;
		commentUrl = eventData.comment.html_url as string;

		// 1. Identify sender persona if bot
		if (sender === botUser) {
			const personaMatch = body.match(/I am the \*\*(.+?)\*\*/);
			if (personaMatch) {
				senderPersona = personaMatch[1];
			}
		}

		// 2. Identify target persona
		let targetedPersona: string | null = null;
		const nextStepMatch = body.match(/Next step: (@[a-z-]+)/i);
		if (nextStepMatch) {
			targetedPersona = handleMap[nextStepMatch[1].toLowerCase()] || null;
		}
		if (!targetedPersona) {
			const mentions = body.match(/@[a-z-]+/gi);
			if (mentions) {
				// Search from the end to find the most recent handoff
				for (let i = mentions.length - 1; i >= 0; i--) {
					const handle = mentions[i].toLowerCase();
					if (handleMap[handle]) {
						targetedPersona = handleMap[handle];
						break;
					}
				}
			}
		}

		console.log(`Targeted persona from mentions: ${targetedPersona}`);

		// 3. State Machine Logic
		let shouldExecute = false;
		if (activePersona === "overseer") {
			shouldExecute = true;
			executedPersona = "overseer";
		} else if (activePersona !== null) {
			// If an agent is active, it ONLY runs if it was targeted
			if (targetedPersona === activePersona) {
				shouldExecute = true;
				executedPersona = activePersona;
			}
		} else if (targetedPersona === "overseer") {
			// Quiescent state: human can wake up Overseer
			shouldExecute = true;
			executedPersona = "overseer";
		}

		if (shouldExecute && executedPersona) {
			appendGithubOutput("persona_executed", "true");
			appendGithubOutput("executed_persona", executedPersona);
			traceContext = {
				traceId: makeTraceId({
					runId: process.env.GITHUB_RUN_ID,
					persona: executedPersona,
					issueNumber,
				}),
				persona: executedPersona,
				owner,
				repo,
				issueNumber,
				runId: process.env.GITHUB_RUN_ID,
				eventName,
				sender,
				commentUrl,
				senderPersona,
			};
			// 4. Persona-Specific Bot Protection: Prevent self-triggering
			if (
				sender === botUser &&
				senderPersona === personaNameMap[executedPersona]
			) {
				console.log(`Ignoring self-trigger from ${executedPersona}`);
				return;
			}

			console.log(`Executing persona: ${executedPersona}`);
			try {
				iterationResult = await runWithTraceContext(traceContext, async () => {
					logTrace("dispatcher.persona.dispatch", {
						trigger: "issue_comment.created",
						activePersona,
						targetedPersona,
						body: textStats(body),
					});

					if (executedPersona === "overseer") {
						return personas.overseer.handleComment(
							owner,
							repo,
							issueNumber,
							sender,
							body,
							commentUrl,
							senderPersona,
						);
					}
					if (executedPersona === "product-architect") {
						return personas.productArchitect.handleMention(
							owner,
							repo,
							issueNumber,
							sender,
							body,
							commentUrl,
							senderPersona,
						);
					}
					if (executedPersona === "planner") {
						return personas.planner.handleMention(
							owner,
							repo,
							issueNumber,
							sender,
							body,
							commentUrl,
							senderPersona,
						);
					}
					if (executedPersona === "developer-tester") {
						return personas.developerTester.handleTask(
							owner,
							repo,
							issueNumber,
							body,
							commentUrl,
							senderPersona,
						);
					}
					if (executedPersona === "quality") {
						const prMatch =
							body.match(/PR.*?#(\d+)/i) || body.match(/pull.*?\/(\d+)/i);
						const prNumber = prMatch ? Number.parseInt(prMatch[1], 10) : 0;
						logTrace("dispatcher.quality.prInference", {
							body: textStats(body),
							prNumber,
						});
						return personas.quality.handleReviewRequest(
							owner,
							repo,
							issueNumber,
							prNumber,
							sender,
							commentUrl,
							senderPersona,
						);
					}
					return null;
				});
			} catch (error) {
				console.error(`Persona failed: ${executedPersona}`, error);
				await runWithTraceContext(traceContext, async () => {
					logTrace("dispatcher.persona.error", {
						error:
							error instanceof Error ? error.stack || error.message : error,
					});
				});
				iterationResult = {
					finalResponse: `ERROR: Execution failed. Details: ${error instanceof Error ? error.message : String(error)}`,
					log: `CRITICAL ERROR: ${error}`,
				};
			}
		}
	}

	if (iterationResult && executedPersona) {
		const finalTraceContext =
			traceContext ||
			({
				traceId: makeTraceId({
					runId: process.env.GITHUB_RUN_ID,
					persona: executedPersona,
					issueNumber,
				}),
				persona: executedPersona,
				owner,
				repo,
				issueNumber,
				runId: process.env.GITHUB_RUN_ID,
				eventName,
				sender,
				commentUrl,
				senderPersona,
			} satisfies TraceContext);
		await runWithTraceContext(finalTraceContext, async () => {
			logTrace("dispatcher.finalize.begin", {
				finalResponse: textStats(iterationResult?.finalResponse || ""),
				log: textStats(iterationResult?.log || ""),
			});
			await finalizeRun(
				github,
				owner,
				repo,
				issueNumber,
				executedPersona,
				iterationResult,
				handleMap,
				personaNameMap,
				sender,
				commentUrl,
				senderPersona,
			);
		});
	}
}

async function finalizeRun(
	github: GitHubService,
	owner: string,
	repo: string,
	issueNumber: number,
	persona: string,
	result: IterationResult,
	handleMap: Record<string, string>,
	personaNameMap: Record<string, string>,
	triggeringUser?: string,
	triggeringCommentUrl?: string,
	triggeringPersona?: string,
) {
	// 1. Save Session Log as Artifact
	const logPath = `session_${persona}_${Date.now()}.log`;
	fs.writeFileSync(logPath, result.log);

	// 2. Determine Next Persona
	let nextPersona: string | null = null;
	if (persona !== "overseer") {
		nextPersona = "overseer";
	} else {
		const nextStepMatch = result.finalResponse.match(/Next step: (@[a-z-]+)/i);
		if (nextStepMatch) {
			nextPersona = handleMap[nextStepMatch[1].toLowerCase()] || null;
			if (nextPersona === "overseer") nextPersona = null;
		}
	}

	// 3. Update State
	await github.setActivePersona(owner, repo, issueNumber, nextPersona);

	// 4. Build Final Response with Hardcoded Attribution
	const runId = process.env.GITHUB_RUN_ID;
	const artifactLink = runId
		? `\n\n[View Full Execution Log](https://github.com/${owner}/${repo}/actions/runs/${runId})`
		: "";

	const currentPersonaName = personaNameMap[persona];
	const attributionHeader = getAttribution(
		currentPersonaName,
		issueNumber,
		triggeringUser,
		triggeringCommentUrl,
		triggeringPersona,
	);

	const finalComment =
		attributionHeader + truncate(result.finalResponse, 50000) + artifactLink;

	try {
		await github.addCommentToIssue(owner, repo, issueNumber, finalComment);
	} catch (error) {
		console.error("Failed to post comment, attempting a smaller one", error);
		const fallback = `${attributionHeader}I finished my task, but my full response was too large to post as a GitHub comment. I have returned control to the hub.\n\nNext step: @overseer to take action`;
		await github.addCommentToIssue(owner, repo, issueNumber, fallback);
	}
}

run().catch((error) => {
	console.error("Fatal error in dispatcher:", error);
	process.exit(1);
});
