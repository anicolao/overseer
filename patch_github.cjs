const fs = require("fs");
let code = fs.readFileSync("src/utils/github.ts", "utf8");

if (!code.includes("checkCollaborator")) {
	const method = `
    async checkCollaborator(owner: string, repo: string, username: string): Promise<boolean> {
        try {
            const response = await this.octokit.rest.repos.checkCollaborator({
                owner,
                repo,
                username,
            });
            return response.status === 204;
        } catch (error: any) {
            if (error.status === 404) {
                return false;
            }
            throw error;
        }
    }
`;
	// Insert before the last closing brace
	const lastBraceIndex = code.lastIndexOf("}");
	code =
		code.substring(0, lastBraceIndex) + method + code.substring(lastBraceIndex);
	fs.writeFileSync("src/utils/github.ts", code);
}
