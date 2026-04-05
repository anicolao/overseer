import * as fs from "node:fs";
import { getBotOrThrow, loadBotRegistry } from "./bots/bot_config.js";
import { OverseerPersona } from "./personas/overseer.js";
import { TaskPersona } from "./personas/task_persona.js";
import type { IterationResult } from "./utils/agent_runner.js";
import { isWorkflowNoiseComment } from "./utils/comment_markers.js";
import { GeminiService } from "./utils/gemini.js";
import { GitHubService } from "./utils/github.js";
import {
	buildNextStepLine,
	resolveNextPersona,
	stripTrailingNextStep,
} from "./utils/handoff.js";
import { PersistenceService } from "./utils/persistence.js";
import {
	extractAutomatedPersonaName,
	extractPersonaMentions,
	getAttribution,
	hasExplicitPersonaMention,
	isAutomatedPersonaComment,
	stripMarkdownCode,
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

function extractRepoPathsForDirectRepair(text: string): string[] {
	const matches = text.matchAll(
		/(?:^|[`(\s])((?:src|prompts|docs)\/[A-Za-z0-9_./-]+|bots\.json|AGENTS\.md)(?=$|[`),.\s])/g,
	);
	const paths = new Set<string>();
	for (const match of matches) {
		const value = match[1]?.trim();
		if (value) {
			paths.add(value);
		}
	}
	return [...paths];
}

function extractDesignDocPathForDirectRepair(text: string): string | null {
	const match = text.match(
		/(?:^|[`(\s])((?:docs\/(?:design|architecture)\/[A-Za-z0-9_./-]+\.md))(?=$|[`),.\s])/i,
	);
	return match?.[1]?.trim() || null;
}

function shouldBypassOverseerForDirectDesignRepair(body: string): boolean {
	return (
		hasExplicitPersonaMention(body, "@overseer") &&
		/design/i.test(body) &&
		/(still do not approve|do not approve|design-repair task|route this directly back to the product architect)/i.test(
			body,
		)
	);
}

function buildDirectDesignRepairIterationResult(body: string): IterationResult {
	const designFile =
		extractDesignDocPathForDirectRepair(body) || "docs/design/persist-qa.md";
	const filesToRead = Array.from(
		new Set([designFile, ...extractRepoPathsForDirectRepair(body)]),
	);
	const correction = body.replace(/^@overseer\b\s*/i, "").trim();
	const finalResponse = [
		"The human has explicitly rejected the current design and provided a concrete correction. I am routing that correction directly back to the Product Architect as a design-repair task.",
		"",
		"Architect Task:",
		"Task ID: MVP validation: persist_qa end-to-end",
		`Design File: ${designFile}`,
		"Design Approval Status: needs_revision",
		"Files To Read:",
		...filesToRead.map((path) => `- ${path}`),
		`Human Correction: ${correction}`,
		`Current Step: Revise ${designFile} so it reflects the latest human correction and accurately describes the real prompt, manifest/config, protocol, runtime execution, and runtime wiring seams in this repository.`,
		`Task Summary: Rewrite the stale sections of ${designFile} to match this correction literally where relevant: ${correction}`,
		`Done When: ${designFile} accurately explains prompt content in prompts/quality.md, manifest/config in bots.json and src/bots/bot_config.ts, protocol/schema in src/utils/agent_protocol.ts, runtime execution in src/utils/agent_runner.ts, runtime wiring in src/personas/task_persona.ts, and does not invent fields that do not exist in the source.`,
		"Verification:",
		`- cat ${designFile}`,
		"Likely Next Step: human approval",
	].join("\n");

	return {
		finalResponse,
		handoffTo: "@product-architect",
		log: `DIRECT DISPATCH DESIGN REPAIR\n\n${finalResponse}`,
	};
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
	const botRegistry = loadBotRegistry();

	const personas = {
		overseer: new OverseerPersona(
			getBotOrThrow(botRegistry, "overseer"),
			gemini,
			github,
		),
		productArchitect: new TaskPersona(
			getBotOrThrow(botRegistry, "product-architect"),
			gemini,
			persistence,
		),
		planner: new TaskPersona(
			getBotOrThrow(botRegistry, "planner"),
			gemini,
			persistence,
		),
		developerTester: new TaskPersona(
			getBotOrThrow(botRegistry, "developer-tester"),
			gemini,
			persistence,
		),
		quality: new TaskPersona(
			getBotOrThrow(botRegistry, "quality"),
			gemini,
			persistence,
		),
	};

	const sender = eventData.sender?.login;
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
		if (isWorkflowNoiseComment(body)) {
			logTrace("dispatcher.issueComment.skippedWorkflowNoise", {
				body: textStats(body),
			});
			console.log(
				"Skipping issue_comment dispatch for workflow noise comment.",
			);
			return;
		}
		const automatedPersona = extractAutomatedPersonaName(body);
		const isAutomatedComment = isAutomatedPersonaComment(body);
		if (
			!isAutomatedComment &&
			activePersona === null &&
			shouldBypassOverseerForDirectDesignRepair(body)
		) {
			appendGithubOutput("persona_executed", "true");
			appendGithubOutput("executed_persona", "overseer");
			await finalizeRun(
				github,
				owner,
				repo,
				issueNumber,
				"overseer",
				buildDirectDesignRepairIterationResult(body),
				personaNameMap,
				sender,
				commentUrl,
			);
			return;
		}

		// 1. Identify sender persona if bot
		if (automatedPersona) {
			senderPersona = automatedPersona;
		}

		// 2. Identify target persona
		let targetedPersona: string | null = null;
		const bodyWithoutCodeMentions = extractPersonaMentions(
			body.replace(/Next step:/gi, "\nNext step: "),
		);
		const nextStepMatch = stripNextStepHandle(body);
		if (nextStepMatch) {
			targetedPersona = handleMap[nextStepMatch.toLowerCase()] || null;
		}
		if (!targetedPersona) {
			if (bodyWithoutCodeMentions.length > 0) {
				// Search from the end to find the most recent handoff
				for (let i = bodyWithoutCodeMentions.length - 1; i >= 0; i--) {
					const handle = bodyWithoutCodeMentions[i].toLowerCase();
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
				isAutomatedComment &&
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
						return personas.productArchitect.handleTask(
							owner,
							repo,
							issueNumber,
							body,
						);
					}
					if (executedPersona === "planner") {
						return personas.planner.handleTask(owner, repo, issueNumber, body);
					}
					if (executedPersona === "developer-tester") {
						return personas.developerTester.handleTask(
							owner,
							repo,
							issueNumber,
							body,
						);
					}
					if (executedPersona === "quality") {
						return personas.quality.handleTask(owner, repo, issueNumber, body);
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
				personaNameMap,
				sender,
				commentUrl,
				senderPersona,
			);
		});
	}
}

function stripNextStepHandle(body: string): string | null {
	const sanitized = stripMarkdownCode(body);
	const nextStepMatch = sanitized.match(/Next step: (@[a-z-]+)/i);
	return nextStepMatch?.[1] || null;
}

async function finalizeRun(
	github: GitHubService,
	owner: string,
	repo: string,
	issueNumber: number,
	persona: string,
	result: IterationResult,
	personaNameMap: Record<string, string>,
	triggeringUser?: string,
	triggeringCommentUrl?: string,
	triggeringPersona?: string,
) {
	// 1. Save Session Log as Artifact
	const logPath = `session_${persona}_${Date.now()}.log`;
	fs.writeFileSync(logPath, result.log);

	if (result.suppressFinalComment) {
		logTrace("dispatcher.finalize.commentSuppressed", {
			persona,
			reason: "iteration_result_requested_suppression",
			log: textStats(result.log),
		});
		return;
	}

	// 2. Determine Next Persona
	const nextPersona = resolveNextPersona(persona, result.handoffTo);
	const nextStepLine = buildNextStepLine(persona, result.handoffTo);

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

	const finalBody = stripTrailingNextStep(result.finalResponse);
	const finalComment =
		attributionHeader +
		truncate(`${finalBody}\n\n${nextStepLine}`, 50000) +
		artifactLink;

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
