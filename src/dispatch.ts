import * as fs from "node:fs";
import { DeveloperTesterPersona } from "./personas/developer_tester.js";
import { OverseerPersona } from "./personas/overseer.js";
import { PlannerPersona } from "./personas/planner.js";
import { ProductArchitectPersona } from "./personas/product_architect.js";
import { QualityPersona } from "./personas/quality.js";
import type { IterationResult } from "./utils/agent_runner.js";
import { GeminiService } from "./utils/gemini.js";
import { GitHubService } from "./utils/github.js";
import { getAttribution } from "./utils/persona_helper.js";
import { ShellService } from "./utils/shell.js";
import { truncate } from "./utils/text.js";

async function run() {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath) throw new Error("GITHUB_EVENT_PATH not found");

	const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
	const eventName = process.env.GITHUB_EVENT_NAME;

	const geminiApiKey = process.env.GEMINI_API_KEY || "";
	const githubToken = process.env.GITHUB_TOKEN || "";

	const gemini = new GeminiService(geminiApiKey);
	const github = new GitHubService(githubToken);
	const shell = new ShellService();

	const personas = {
		overseer: new OverseerPersona(gemini, github),
		productArchitect: new ProductArchitectPersona(gemini, github),
		planner: new PlannerPersona(gemini, github),
		developerTester: new DeveloperTesterPersona(gemini, github),
		quality: new QualityPersona(gemini, github),
	};

	const sender = eventData.sender?.login;
	const botUser = "anicolao"; // The identity used by OVERSEER_TOKEN

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

	if (eventName === "issues" && eventData.action === "opened") {
		iterationResult = await personas.overseer.handleNewIssue(
			owner,
			repo,
			issueNumber,
			eventData.issue.title,
			eventData.issue.body || "",
		);
		executedPersona = "overseer";
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
				if (executedPersona === "overseer") {
					iterationResult = await personas.overseer.handleComment(
						owner,
						repo,
						issueNumber,
						sender,
						body,
						commentUrl,
						senderPersona,
					);
				} else if (executedPersona === "product-architect") {
					iterationResult = await personas.productArchitect.handleMention(
						owner,
						repo,
						issueNumber,
						sender,
						body,
						commentUrl,
						senderPersona,
					);
				} else if (executedPersona === "planner") {
					iterationResult = await personas.planner.handleMention(
						owner,
						repo,
						issueNumber,
						sender,
						body,
						commentUrl,
						senderPersona,
					);
				} else if (executedPersona === "developer-tester") {
					iterationResult = await personas.developerTester.handleTask(
						owner,
						repo,
						issueNumber,
						body,
						commentUrl,
						senderPersona,
					);
				} else if (executedPersona === "quality") {
					const prMatch =
						body.match(/PR.*?#(\d+)/i) || body.match(/pull.*?\/(\d+)/i);
					const prNumber = prMatch ? Number.parseInt(prMatch[1], 10) : 0;
					iterationResult = await personas.quality.handleReviewRequest(
						owner,
						repo,
						issueNumber,
						prNumber,
						sender,
						commentUrl,
						senderPersona,
					);
				}
			} catch (error) {
				console.error(`Persona failed: ${executedPersona}`, error);
				iterationResult = {
					finalResponse: `ERROR: Execution failed. Details: ${error instanceof Error ? error.message : String(error)}`,
					log: `CRITICAL ERROR: ${error}`,
				};
			}
		}
	}

	if (iterationResult && executedPersona) {
		await finalizeRun(
			github,
			shell,
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
	}
}

async function finalizeRun(
	github: GitHubService,
	shell: ShellService,
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

	// 2. Automated Persistence
	if (["developer-tester", "product-architect", "planner"].includes(persona)) {
		console.log(
			`Specialized agent ${persona} finished. Attempting automated persistence...`,
		);
		const branchName = `bot/issue-${issueNumber}`;
		await shell.executeCommand('git config --global user.name "Overseer Bot"');
		await shell.executeCommand(
			'git config --global user.email "overseer-bot@users.noreply.github.com"',
		);
		await shell.executeCommand(
			`git add . && git commit -m "Auto-commit: ${persona} work for #${issueNumber}" || echo "No changes to commit"`,
		);
		await shell.executeCommand(
			`git push origin HEAD:${branchName} || echo "No changes to push"`,
		);
	}

	// 3. Determine Next Persona
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

	// 4. Update State
	await github.setActivePersona(owner, repo, issueNumber, nextPersona);

	// 5. Build Final Response with Hardcoded Attribution
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
