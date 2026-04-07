const fs = require("fs");

const code = `import * as crypto from "node:crypto";
import type { Request, Response } from "express";
import { processDispatchEvent } from "./dispatch.js";
import { GitHubService } from "./utils/github.js";

const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET || "";
const ALLOWED_USERS = (process.env.OVERSEER_ALLOWED_USERS || "")
	.split(",")
	.map((u) => u.trim())
	.filter(Boolean);

export const overseerWebhook = async (req: Request, res: Response) => {
	// 1. Verify Webhook Signature
	const signature = req.headers["x-hub-signature-256"] as string;
	if (!verifySignature(req.body, signature, webhookSecret)) {
		console.error("Invalid signature");
		return res.status(401).send("Invalid signature");
	}

	const eventName = req.headers["x-github-event"] as string;
	const eventData = req.body;

	console.log(\`Received GitHub event: \${eventName}\`);

	try {
		// Implement access control checks
		const sender = eventData.sender?.login;
		if (sender) {
			const repoOwner = eventData.repository?.owner?.login;
			const repoName = eventData.repository?.name;
			
			let isAuthorized = false;
			
			if (ALLOWED_USERS.length > 0 && ALLOWED_USERS.includes(sender)) {
				isAuthorized = true;
			} else if (repoOwner && repoName) {
				const githubToken = process.env.GITHUB_TOKEN || "";
				if (githubToken) {
					const github = new GitHubService(githubToken);
					try {
						const isCollaborator = await github.checkCollaborator(repoOwner, repoName, sender);
						if (isCollaborator) {
							isAuthorized = true;
						}
					} catch (err) {
						console.warn(\`Could not verify collaborator status for \${sender}:\`, err);
					}
				}
			}

			if (!isAuthorized) {
				console.log(\`User \${sender} is not authorized. Dropping event.\`);
				return res.status(403).send("User not authorized");
			}
		}

		// Delegate to dispatcher
		await processDispatchEvent({
			eventName,
			eventData,
			runId: process.env.GITHUB_RUN_ID || crypto.randomUUID(),
		});

		res.status(200).send("Event processed");
	} catch (error) {
		console.error("Error processing event:", error);
		res.status(500).send("Internal server error");
	}
};

function verifySignature(
	payload: unknown,
	signature: string,
	secret: string,
): boolean {
	if (!signature || !secret) return false;
	const hmac = crypto.createHmac("sha256", secret);
	const digest = \`sha256=\${hmac.update(JSON.stringify(payload)).digest("hex")}\`;
	return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
`;

fs.writeFileSync("src/index.ts", code);
