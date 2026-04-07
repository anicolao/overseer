import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { isWorkflowNoiseComment } from "./comment_markers.js";
import { truncate } from "./text.js";
import { logTrace, textStats } from "./trace.js";

export class GitHubService {
	private octokit: Octokit;

	constructor(token: string) {
		const appId = process.env.APP_ID;
		const privateKey = process.env.PRIVATE_KEY;

		if (appId && privateKey) {
			this.octokit = new Octokit({
				authStrategy: createAppAuth,
				auth: {
					appId,
					privateKey,
				},
			});
		} else {
			this.octokit = new Octokit({ auth: token });
		}
	}

	async addCommentToIssue(
		owner: string,
		repo: string,
		issueNumber: number,
		body: string,
	) {
		return this.octokit.rest.issues.createComment({
			owner,
			repo,
			issue_number: issueNumber,
			body,
		});
	}

	async updateIssueLabels(
		owner: string,
		repo: string,
		issueNumber: number,
		labels: string[],
	) {
		return this.octokit.rest.issues.setLabels({
			owner,
			repo,
			issue_number: issueNumber,
			labels,
		});
	}

	async getIssue(owner: string, repo: string, issueNumber: number) {
		const startedAt = Date.now();
		const result = await this.octokit.rest.issues.get({
			owner,
			repo,
			issue_number: issueNumber,
		});
		logTrace("github.issue.get", {
			durationMs: Date.now() - startedAt,
			title: textStats(result.data.title),
			body: textStats(result.data.body || ""),
			commentCount: result.data.comments,
		});
		return result;
	}

	async createOrUpdateFile(
		owner: string,
		repo: string,
		path: string,
		message: string,
		content: string,
		branch: string = "main",
	) {
		let sha: string | undefined;
		try {
			const { data } = await this.octokit.rest.repos.getContent({
				owner,
				repo,
				path,
				ref: branch,
			});
			if (!Array.isArray(data)) {
				sha = data.sha;
			}
		} catch (_error) {
			// File doesn't exist yet, that's fine
		}

		return this.octokit.rest.repos.createOrUpdateFileContents({
			owner,
			repo,
			path,
			message,
			content: Buffer.from(content).toString("base64"),
			sha,
			branch,
		});
	}

	async listPullRequests(owner: string, repo: string, headBranch: string) {
		return this.octokit.rest.pulls.list({
			owner,
			repo,
			head: `${owner}:${headBranch}`,
			state: "open",
		});
	}

	async getIssueLabels(
		owner: string,
		repo: string,
		issueNumber: number,
	): Promise<string[]> {
		const startedAt = Date.now();
		const { data: issue } = await this.octokit.rest.issues.get({
			owner,
			repo,
			issue_number: issueNumber,
		});
		const labels = issue.labels.map((l: string | { name?: string }) =>
			typeof l === "string" ? l : (l.name ?? ""),
		);
		logTrace("github.issue.labels", {
			durationMs: Date.now() - startedAt,
			labels,
		});
		return labels;
	}

	async setActivePersona(
		owner: string,
		repo: string,
		issueNumber: number,
		persona: string | null,
	) {
		const currentLabels = await this.getIssueLabels(owner, repo, issueNumber);
		const filteredLabels = currentLabels.filter(
			(label) => !label.startsWith("active-persona:"),
		);

		if (persona) {
			filteredLabels.push(`active-persona:${persona}`);
		}

		return this.octokit.rest.issues.setLabels({
			owner,
			repo,
			issue_number: issueNumber,
			labels: filteredLabels,
		});
	}

	async getIssueCommentCount(
		owner: string,
		repo: string,
		issueNumber: number,
	): Promise<number> {
		const { data: issue } = await this.octokit.rest.issues.get({
			owner,
			repo,
			issue_number: issueNumber,
		});
		return issue.comments;
	}

	async createBranch(
		owner: string,
		repo: string,
		branchName: string,
		baseBranch: string = "main",
	) {
		const baseRef = await this.octokit.rest.git.getRef({
			owner,
			repo,
			ref: `heads/${baseBranch}`,
		});

		return this.octokit.rest.git.createRef({
			owner,
			repo,
			ref: `refs/heads/${branchName}`,
			sha: baseRef.data.object.sha,
		});
	}

	async getFileContent(
		owner: string,
		repo: string,
		path: string,
		ref: string = "main",
	): Promise<string> {
		const { data } = await this.octokit.rest.repos.getContent({
			owner,
			repo,
			path,
			ref,
		});
		if ("content" in data && typeof data.content === "string") {
			return Buffer.from(data.content, "base64").toString("utf8");
		}
		throw new Error(`Path ${path} is not a file or has no content`);
	}

	async getPullRequestFiles(owner: string, repo: string, pullNumber: number) {
		return this.octokit.rest.pulls.listFiles({
			owner,
			repo,
			pull_number: pullNumber,
		});
	}

	async listIssueComments(owner: string, repo: string, issueNumber: number) {
		const startedAt = Date.now();
		const result = await this.octokit.rest.issues.listComments({
			owner,
			repo,
			issue_number: issueNumber,
		});
		logTrace("github.issueComments.list", {
			durationMs: Date.now() - startedAt,
			commentCount: result.data.length,
		});
		return result;
	}

	async getFullIssueContext(
		owner: string,
		repo: string,
		issueNumber: number,
	): Promise<string> {
		const issue = await this.getIssue(owner, repo, issueNumber);
		const comments = await this.listIssueComments(owner, repo, issueNumber);

		let context = `ISSUE TITLE: ${issue.data.title}\n`;
		context += `ISSUE BODY:\n${issue.data.body || "No body provided."}\n\n`;
		context += "--- COMMENTS (Truncated to last 15) ---\n";

		// Only take the last 15 comments to prevent payload explosion
		const recentComments = comments.data
			.filter((comment) => !isWorkflowNoiseComment(comment.body || ""))
			.slice(-15);

		for (const comment of recentComments) {
			const author = comment.user?.login;
			// Truncate each individual comment to avoid massive bot chatter drowning out context
			const commentBody = truncate(comment.body || "", 5000);
			context += `COMMENT BY @${author}:\n${commentBody}\n\n`;
		}

		logTrace("github.issueContext.built", {
			totalComments: comments.data.length,
			includedComments: recentComments.length,
			context: textStats(context),
		});

		return context;
	}

	async createPullRequest(
		owner: string,
		repo: string,
		title: string,
		body: string,
		head: string,
		base: string = "main",
	) {
		return this.octokit.rest.pulls.create({
			owner,
			repo,
			title,
			body,
			head,
			base,
		});
	}
}
