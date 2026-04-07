const fs = require("fs");
let code = fs.readFileSync("src/index.ts", "utf8");

code = code.replace(
	'const appTokenManager = new (require("./utils/github.js").AppTokenManager)();',
	"const appTokenManager = new AppTokenManager();",
);

fs.writeFileSync("src/index.ts", code);
