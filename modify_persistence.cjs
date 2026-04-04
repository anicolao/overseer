const { readFileSync, writeFileSync } = require('fs');

let content = readFileSync('src/utils/persistence.ts', 'utf8');

content = content.replace(
	/async persistWork\(\s*issueNumber: number,\s*persona: string,\s*\): Promise<PersistWorkResult> \{[\s\S]*?(?=\n\tprivate getBranchName)/,
	`async persistWork(
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
				message: \`Persistence must run on \${branch}, but the current branch is \${currentBranch}.\`,
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
				["push", "origin", \`HEAD:\${branch}\`],
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
				message: \`Pushed \${aheadCount} existing local commit(s) to \${branch}.\`,
			};
		}

		const commitMessage = \`\${persona}: issue #\${issueNumber} persist \${mode}\`;
		const commitResult = await this.runGitAllowFailure(
			["commit", "-m", commitMessage],
			"persistence.commit",
			{ branch, changedFiles, persona },
		);
		if (commitResult.exitCode !== 0) {
			const commitOutput = [commitResult.stdout, commitResult.stderr]
				.filter(Boolean)
				.join("\\n");
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
			["push", "origin", \`HEAD:\${branch}\`],
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
			message: \`Persisted \${changedFiles.length} file(s) to \${branch}.\`,
		};
	}`
);

content = content.replace(
	/private async stageRelevantChanges\(branch: string\): Promise<void> \{[\s\S]*?\n\t\}/,
	`private async stageRelevantChanges(branch: string): Promise<void> {
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
	}`
);

writeFileSync('src/utils/persistence.ts', content, 'utf8');
