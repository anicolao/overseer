import * as crypto from "node:crypto";
import type { Request, Response } from "express";
import { getBotOrThrow, loadBotRegistry } from "./bots/bot_config.js";
import { OverseerPersona } from "./personas/overseer.js";
import { TaskPersona } from "./personas/task_persona.js";
import { GeminiService } from "./utils/gemini.js";
import { GitHubService } from "./utils/github.js";
import { PersistenceService } from "./utils/persistence.js";

// Initialize services (using env variables)
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const githubToken = process.env.GITHUB_TOKEN || "";
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || "";

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

export const overseerWebhook = async (req: Request, res: Response) => {
	// 1. Verify Webhook Signature
	const signature = req.headers["x-hub-signature-256"] as string;
	if (!verifySignature(req.body, signature, webhookSecret)) {
		console.error("Invalid signature");
		return res.status(401).send("Invalid signature");
	}

	const event = req.headers["x-github-event"] as string;
	const payload = req.body;

	console.log(`Received GitHub event: ${event}`);

	try {
		if (event === "issues" && payload.action === "opened") {
			const { owner, name } = payload.repository;
			const { number, title, body } = payload.issue;
			await personas.overseer.handleNewIssue(
				owner.login,
				name,
				number,
				title,
				body || "",
			);
		} else if (event === "issue_comment" && payload.action === "created") {
			const { owner, name } = payload.repository;
			const { number } = payload.issue;
			const { body, user } = payload.comment;

			// Route based on @mentions in the comment body
			if (body.includes("@overseer")) {
				await personas.overseer.handleComment(
					owner.login,
					name,
					number,
					user.login,
					body,
				);
			}
			if (body.includes("@product-architect")) {
				await personas.productArchitect.handleTask(number, body);
			}
			if (body.includes("@planner")) {
				await personas.planner.handleTask(number, body);
			}
			// Additional routing logic for Developer/Tester and Quality...
		}

		res.status(200).send("Event processed");
	} catch (error) {
		console.error("Error processing event:", error);
		res.status(500).send("Internal server error");
	}
};

function verifySignature(
	payload: any,
	signature: string,
	secret: string,
): boolean {
	if (!signature || !secret) return false;
	const hmac = crypto.createHmac("sha256", secret);
	const digest = `sha256=${hmac.update(JSON.stringify(payload)).digest("hex")}`;
	return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
