const fs = require("fs");
let code = fs.readFileSync("src/index.ts", "utf8");

code = code.replace(
	'const githubToken = process.env.GITHUB_TOKEN || "";',
	`const appTokenManager = new (require("./utils/github.js").AppTokenManager)();
				const githubToken = process.env.GITHUB_TOKEN || await appTokenManager.getInstallationToken(repoOwner, repoName).catch(() => "");`,
);

fs.writeFileSync("src/index.ts", code);
