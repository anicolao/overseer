import * as fs from "node:fs";
import { DeveloperTesterPersona } from "./personas/developer_tester.js";
import { OverseerPersona } from "./personas/overseer.js";
import { PlannerPersona } from "./personas/planner.js";
import { ProductArchitectPersona } from "./personas/product_architect.js";
import { QualityPersona } from "./personas/quality.js";
import type { IterationResult } from "./utils/agent_runner.js";
import { GeminiService } from "./utils/gemini.js";
import { GitHubService } from "./utils/github.js";
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

	console.log(`Active persona: ${activePersona}`);

	const handleMap: Record<string, string> = {
		"@overseer": "overseer",
		"@product-architect": "product-architect",
		"@planner": "planner",
		"@developer-tester": "developer-tester",
		"@quality": "quality",
	};

	let iterationResult: IterationResult | null = null;
	let executedPersona: string | null = null;

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
		const commentUrl = eventData.comment.html_url as string;

		// 1. Identify sender persona if bot
		let senderPersona: string | undefined;
		if (sender === botUser) {
			const personaMatch = body.match(/^I am the \*\*(.+?)\*\*/);
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
				for (let i = mentions.length - 1; i >= 0; i--) {
					const handle = mentions[i].toLowerCase();
					if (handleMap[handle]) {
						targetedPersona = handleMap[handle];
						break;
					}
				}
			}
		}

		// 3. State Machine Logic
		let shouldExecute = false;
		if (activePersona === "overseer") {
			shouldExecute = true;
			executedPersona = "overseer";
		} else if (activePersona !== null) {
			if (targetedPersona === activePersona) {
				shouldExecute = true;
				executedPersona = activePersona;
			}
		} else if (targetedPersona === "overseer") {
			shouldExecute = true;
			executedPersona = "overseer";
		}

		if (shouldExecute && executedPersona) {
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
					const prNumber = prMatch ? parseInt(prMatch[1], 10) : 0;
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
) {
	// 1. Save Session Log as Artifact (Simulated via local file for Action to pick up)
	const logPath = `session_${persona}_${Date.now()}.log`;
	fs.writeFileSync(logPath, result.log);

	// 2. Automated Persistence (Commit/Push changes if specialized agent)
	if (["developer-tester", "product-architect", "planner"].includes(persona)) {
		console.log(
			"Specialized agent finished. Attempting automated persistence...",
		);
		const branchName = `bot/issue-${issueNumber}`;
		await shell.executeCommand(`git config --global user.name "Overseer Bot"`);
		await shell.executeCommand(
			`git config --global user.email "overseer-bot@users.noreply.github.com"`,
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
			if (nextPersona === "overseer") nextPersona = null; // Safety: never delegate to self
		}
	}

	// 4. Update State & Post Summary
	await github.setActivePersona(owner, repo, issueNumber, nextPersona);

	const runId = process.env.GITHUB_RUN_ID;
	const artifactLink = runId
		? `\n\n[View Full Execution Log](https://github.com/${owner}/${repo}/actions/runs/${runId})`
		: "";

	const finalComment = truncate(result.finalResponse, 50000) + artifactLink;
	await github.addCommentToIssue(owner, repo, issueNumber, finalComment);
}

run().catch((error) => {
	console.error("Fatal error in dispatcher:", error);
	process.exit(1);
});
