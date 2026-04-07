const fs = require("fs");
let code = fs.readFileSync("src/index.ts", "utf8");

code = code.replace(
	"const gemini = new GeminiService(geminiApiKey);",
	`const aiProvider = process.env.AI_PROVIDER || "gemini";
const ai: AiService = aiProvider === "copilot"
\t? new CopilotService(process.env.COPILOT_API_KEY || process.env.GITHUB_TOKEN || "")
\t: new GeminiService(geminiApiKey);`,
);

code = code.replace(
	/getBotOrThrow\(botRegistry, "overseer"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "overseer"),\n\t\tai,',
);
code = code.replace(
	/getBotOrThrow\(botRegistry, "product-architect"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "product-architect"),\n\t\tai,',
);
code = code.replace(
	/getBotOrThrow\(botRegistry, "planner"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "planner"),\n\t\tai,',
);
code = code.replace(
	/getBotOrThrow\(botRegistry, "developer-tester"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "developer-tester"),\n\t\tai,',
);
code = code.replace(
	/getBotOrThrow\(botRegistry, "quality"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "quality"),\n\t\tai,',
);

fs.writeFileSync("src/index.ts", code);
