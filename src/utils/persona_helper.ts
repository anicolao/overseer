import type { GitHubService } from "./github.js";

export function getAttribution(
	personaName: string,
	issueNumber: number,
	commenter?: string,
	commentUrl?: string,
	commenterPersona?: string,
): string {
	const source = commentUrl
		? `[this comment](${commentUrl})`
		: `issue #${issueNumber}`;
	const target = commenterPersona
		? `the ${commenterPersona}`
		: commenter
			? `@${commenter}`
			: "the issue";

	return `I am the **${personaName}**, and I am responding to ${source} from ${target}.\n\n`;
}

export function extractDirectedTask(body: string): string {
	let task = body.trim();

	task = task.replace(
		/^I am the \*\*Overseer\*\*, and I am responding to [\s\S]*?\.\n\n/,
		"",
	);
	task = task.replace(/\n*\s*Next step: @[a-z-]+ to take action\.?\s*$/i, "");
	task = task.replace(/\n*\s*Next step: human review required\.?\s*$/i, "");

	return task.trim();
}

export function hasExplicitPersonaMention(
	text: string,
	personaHandle: string,
): boolean {
	const escapedHandle = personaHandle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|\\s)${escapedHandle}(?=\\s|$)`, "i").test(text);
}

export async function isLimitReached(
	github: GitHubService,
	owner: string,
	repo: string,
	issueNumber: number,
	personaName: string,
	personaHandle: string,
	body?: string,
): Promise<boolean> {
	const commentCount = await github.getIssueCommentCount(
		owner,
		repo,
		issueNumber,
	);

	// Check for setlimit command in the current comment
	if (body?.includes(`${personaHandle} setlimit`)) {
		const match = body.match(
			new RegExp(`${personaHandle} setlimit (\\d+)`, "i"),
		);
		if (match) {
			const newLimit = Number.parseInt(match[1], 10);
			if (!Number.isNaN(newLimit)) {
				await github.addCommentToIssue(
					owner,
					repo,
					issueNumber,
					`I am the ${personaName}, and I have updated the comment limit for this issue to ${newLimit}.`,
				);
				return false; // Not really "reached" if we just updated it
			}
		}
	}

	// Get limit from issue body
	const issue = await github.getIssue(owner, repo, issueNumber);
	const limitMatch = (issue.data.body || "").match(
		new RegExp(`${personaHandle} setlimit (\\d+)`, "i"),
	);
	const limit = limitMatch ? Number.parseInt(limitMatch[1], 10) : 100;

	if (commentCount >= limit) {
		await github.addCommentToIssue(
			owner,
			repo,
			issueNumber,
			`I am the ${personaName}. I have reached the safety limit of ${limit} comments on this issue. Please use \`${personaHandle} setlimit <number>\` to increase the limit if you wish for me to continue.`,
		);
		return true;
	}

	return false;
}
