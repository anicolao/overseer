const fs = require("fs");
let code = fs.readFileSync("src/utils/github.ts", "utf8");

const method = `
	async checkCollaborator(owner: string, repo: string, username: string): Promise<boolean> {
		try {
			await this.octokit.rest.repos.checkCollaborator({
				owner,
				repo,
				username,
			});
			return true;
		} catch (error: any) {
			if (error.status === 404) {
				return false;
			}
			throw error;
		}
	}
}
`;

code = code.replace(
	/}\n\nexport class AppTokenManager {/,
	method + "\nexport class AppTokenManager {",
);
fs.writeFileSync("src/utils/github.ts", code);
