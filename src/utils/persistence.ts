import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logTrace, serializeError } from "./trace.js";

const execFileAsync = promisify(execFile);

interface GitCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface EnsureIssueBranchResult {
	branchName: string;
	created: boolean;
}

export interface PersistWorkResult {
	ok: boolean;
	branch: string;
	commit_sha?: string;
	changed_files?: string[];
	error_code?: string;
	message: string;
	details?: Record<string, string | string[] | number | boolean>;
}

export function parseNullDelimitedPaths(output: string): string[] {
	return Array.from(new Set(output.split("\0").filter(Boolean)));
}

export class PersistenceService {
	async ensureIssueBranch(
		issueNumber: number,
	): Promise<EnsureIssueBranchResult> {
		const branchName = this.getBranchName(issueNumber);
		await this.runGit(
			["config", "--global", "user.name", "Overseer Bot"],
			"persistence.gitConfigUserName",
		);
		await this.runGit(
			[
				"config",
				"--global",
				"user.email",
				"overseer-bot@users.noreply.github.com",
			],
			"persistence.gitConfigUserEmail",
		);
		await this.runGit(["fetch", "origin"], "persistence.fetchOrigin");

		const currentBranch = (
			await this.runGit(
				["rev-parse", "--abbrev-ref", "HEAD"],
				"persistence.currentBranch",
			)
		).stdout.trim();
		const remoteExists = await this.remoteBranchExists(branchName);
		if (currentBranch === branchName) {
			if (!remoteExists) {
				await this.runGit(
					["push", "-u", "origin", branchName],
					"persistence.pushCurrentBranch",
					{ branchName },
				);
			}
			return {
				branchName,
				created: !remoteExists,
			};
		}

		if (remoteExists) {
			await this.runGit(
				["checkout", "-B", branchName, `origin/${branchName}`],
				"persistence.checkoutRemoteBranch",
				{ branchName },
			);
			return {
				branchName,
				created: false,
			};
		}

		await this.runGit(
			["checkout", "-B", branchName, "origin/main"],
			"persistence.createLocalBranch",
			{ branchName },
		);
		await this.runGit(
			["push", "-u", "origin", branchName],
			"persistence.pushNewBranch",
			{ branchName },
		);
		return {
			branchName,
			created: true,
		};
	}

	async persistWork(
		issueNumber: number,
		persona: string,
	): Promise<PersistWorkResult> {
		return this.persistInternal(issueNumber, persona, "work");
	}

	async persistQA(
		issueNumber: number,
		persona: string,
	): Promise<PersistWorkResult> {
		return this.persistInternal(issueNumber, persona, "qa");
	}

	private async persistInternal(
		issueNumber: number,
		persona: string,
		mode: "work" | "qa",
	): Promise<PersistWorkResult> {
		const branch = this.getBranchName(issueNumber);
		try {
			await this.runGit(
				["fetch", "origin", branch],
				"persistence.fetchBranch",
				{
					branch,
				},
			);
		} catch (error) {
			return this.makeErrorResult(
				branch,
				"branch_fetch_failed",
				"Failed to fetch the target issue branch before persisting work.",
				error,
			);
		}

		const currentBranchResult = await this.runGit(
			["rev-parse", "--abbrev-ref", "HEAD"],
			"persistence.currentBranch",
		);
		const currentBranch = currentBranchResult.stdout.trim();
		if (currentBranch !== branch) {
			return {
				ok: false,
				branch,
				error_code: "wrong_branch",
				message: `Persistence must run on ${branch}, but the current branch is ${currentBranch}.`,
				details: {
					current_branch: currentBranch,
				},
			};
		}

		const aheadCount = await this.getAheadCount(branch);

		try {
			if (mode === "qa") {
				await this.stageQARelevantChanges(branch);
			} else {
				await this.stageRelevantChanges(branch);
			}
		} catch (error) {
			return this.makeErrorResult(
				branch,
				"stage_failed",
				"Failed to stage repository changes for persistence.",
				error,
			);
		}

		const changedFiles = await this.getStagedChangedPaths();
		if (changedFiles.length === 0 && aheadCount === 0) {
			return {
				ok: false,
				branch,
				error_code: "no_changes",
				message: "No repository changes are available to persist.",
			};
		}

		if (changedFiles.length === 0 && aheadCount > 0) {
			const commitSha = (
				await this.runGit(["rev-parse", "HEAD"], "persistence.commitSha")
			).stdout.trim();
			const pushedFiles = await this.getChangedFilesAgainstRemote(branch);
			const pushResult = await this.runGitAllowFailure(
				["push", "origin", `HEAD:${branch}`],
				"persistence.pushExistingCommits",
				{ branch, commitSha, changedFiles: pushedFiles, aheadCount },
			);
			if (pushResult.exitCode !== 0) {
				const remoteHead = await this.getRemoteHead(branch);
				return {
					ok: false,
					branch,
					error_code: this.classifyPushFailure(pushResult.stderr),
					message:
						"Failed to push local commits that are ahead of the issue branch.",
					details: {
						stdout: pushResult.stdout,
						stderr: pushResult.stderr,
						local_commit_sha: commitSha,
						remote_branch_head: remoteHead,
						changed_files: pushedFiles,
						ahead_count: aheadCount,
					},
				};
			}
			return {
				ok: true,
				branch,
				commit_sha: commitSha,
				changed_files: pushedFiles,
				message: `Pushed ${aheadCount} existing local commit(s) to ${branch}.`,
			};
		}

		const commitMessage = `${persona}: issue #${issueNumber} persist ${mode}`;
		const commitResult = await this.runGitAllowFailure(
			["commit", "-m", commitMessage],
			"persistence.commit",
			{ branch, changedFiles, persona },
		);
		if (commitResult.exitCode !== 0) {
			const commitOutput = [commitResult.stdout, commitResult.stderr]
				.filter(Boolean)
				.join("\n");
			if (commitOutput.includes("nothing to commit")) {
				return {
					ok: false,
					branch,
					error_code: "no_changes",
					message: "No repository changes remained to commit.",
					details: {
						changed_files: changedFiles,
					},
				};
			}
			return {
				ok: false,
				branch,
				error_code: "commit_failed",
				message: "Failed to create a commit for the current work.",
				details: {
					stdout: commitResult.stdout,
					stderr: commitResult.stderr,
					changed_files: changedFiles,
				},
			};
		}

		let commitSha = "";
		try {
			commitSha = (
				await this.runGit(["rev-parse", "HEAD"], "persistence.commitSha")
			).stdout.trim();
		} catch (error) {
			return this.makeErrorResult(
				branch,
				"commit_sha_failed",
				"Created a commit, but failed to resolve the resulting commit SHA.",
				error,
				{ changed_files: changedFiles },
			);
		}

		const pushResult = await this.runGitAllowFailure(
			["push", "origin", `HEAD:${branch}`],
			"persistence.push",
			{ branch, commitSha, changedFiles },
		);
		if (pushResult.exitCode !== 0) {
			const remoteHead = await this.getRemoteHead(branch);
			return {
				ok: false,
				branch,
				error_code: this.classifyPushFailure(pushResult.stderr),
				message: "Failed to push the local commit to the issue branch.",
				details: {
					stdout: pushResult.stdout,
					stderr: pushResult.stderr,
					local_commit_sha: commitSha,
					remote_branch_head: remoteHead,
					changed_files: changedFiles,
				},
			};
		}

		return {
			ok: true,
			branch,
			commit_sha: commitSha,
			changed_files: changedFiles,
			message: `Persisted ${changedFiles.length} file(s) to ${branch}.`,
		};
	}
	private getBranchName(issueNumber: number): string {
		return `bot/issue-${issueNumber}`;
	}

	private async stageRelevantChanges(branch: string): Promise<void> {
		await this.runGit(
			[
				"add",
				"-A",
				"--",
				".",
				":(glob,exclude).backstop/**",
				":(glob,exclude)session_*.log",
			],
			"persistence.stage",
			{ branch },
		);
	}

	private async stageQARelevantChanges(branch: string): Promise<void> {
		await this.runGit(
			[
				"add",
				"-A",
				"--",
				"docs/qa/",
				":(glob,exclude).backstop/**",
				":(glob,exclude)session_*.log",
			],
			"persistence.stageQA",
			{ branch },
		);
	}

	private async getStagedChangedPaths(): Promise<string[]> {
		const result = await this.runGit(
			["diff", "--cached", "--name-only", "-z"],
			"persistence.stagedChangedPaths",
		);
		return parseNullDelimitedPaths(result.stdout).filter(
			(path) => !this.isIgnoredPath(path),
		);
	}

	private isIgnoredPath(path: string): boolean {
		return path.startsWith(".backstop/") || /^session_.*\.log$/.test(path);
	}

	private async remoteBranchExists(branchName: string): Promise<boolean> {
		const result = await this.runGitAllowFailure(
			["ls-remote", "--exit-code", "--heads", "origin", branchName],
			"persistence.remoteBranchExists",
			{ branchName },
		);
		return result.exitCode === 0;
	}

	private async getRemoteHead(branchName: string): Promise<string> {
		const result = await this.runGitAllowFailure(
			["rev-parse", `origin/${branchName}`],
			"persistence.remoteHead",
			{ branchName },
		);
		return result.exitCode === 0 ? result.stdout.trim() : "";
	}

	private async getAheadCount(branchName: string): Promise<number> {
		const result = await this.runGit(
			["rev-list", "--count", `origin/${branchName}..HEAD`],
			"persistence.aheadCount",
			{ branchName },
		);
		const parsed = Number.parseInt(result.stdout.trim(), 10);
		return Number.isNaN(parsed) ? 0 : parsed;
	}

	private async getChangedFilesAgainstRemote(
		branchName: string,
	): Promise<string[]> {
		const result = await this.runGit(
			["diff", "--name-only", "-z", `origin/${branchName}..HEAD`],
			"persistence.changedFilesAgainstRemote",
			{ branchName },
		);
		return parseNullDelimitedPaths(result.stdout).filter(
			(path) => !this.isIgnoredPath(path),
		);
	}

	private classifyPushFailure(stderr: string): string {
		if (stderr.includes("non-fast-forward")) {
			return "non_fast_forward";
		}
		if (stderr.includes("failed to push some refs")) {
			return "push_rejected";
		}
		return "push_failed";
	}

	private makeErrorResult(
		branch: string,
		errorCode: string,
		message: string,
		error: unknown,
		details?: Record<string, string | string[] | number | boolean>,
	): PersistWorkResult {
		return {
			ok: false,
			branch,
			error_code: errorCode,
			message,
			details: {
				...details,
				error: error instanceof Error ? error.message : JSON.stringify(error),
			},
		};
	}

	private async runGit(
		args: string[],
		event: string,
		context?: Record<string, unknown>,
	): Promise<GitCommandResult> {
		const result = await this.runGitAllowFailure(args, event, context);
		if (result.exitCode !== 0) {
			throw new Error(
				`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
			);
		}
		return result;
	}

	private async runGitAllowFailure(
		args: string[],
		event: string,
		context?: Record<string, unknown>,
	): Promise<GitCommandResult> {
		logTrace(event, {
			args,
			...context,
		});
		try {
			const { stdout, stderr } = await execFileAsync("git", args, {
				cwd: process.cwd(),
			});
			return {
				stdout: stdout.trim(),
				stderr: stderr.trim(),
				exitCode: 0,
			};
		} catch (error: unknown) {
			const gitError = error as {
				stdout?: string;
				stderr?: string;
				code?: number;
			};
			logTrace(`${event}.error`, {
				args,
				...context,
				error: serializeError(error),
			});
			return {
				stdout: gitError.stdout?.trim() || "",
				stderr: gitError.stderr?.trim() || "",
				exitCode: gitError.code || 1,
			};
		}
	}
}
