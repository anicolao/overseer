const fs = require("fs");
let code = fs.readFileSync("src/dispatch.ts", "utf8");

code = code.replace(
	"const gemini = new GeminiService(geminiApiKey);",
	`const aiProvider = process.env.AI_PROVIDER || "gemini";
\tconst ai: AiService = aiProvider === "copilot"
\t\t? new CopilotService(process.env.COPILOT_API_KEY || process.env.GITHUB_TOKEN || "")
\t\t: new GeminiService(geminiApiKey);`,
);

code = code.replace(
	/getBotOrThrow\(botRegistry, "overseer"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "overseer"),\n\t\t\tai,',
);
code = code.replace(
	/getBotOrThrow\(botRegistry, "product-architect"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "product-architect"),\n\t\t\tai,',
);
code = code.replace(
	/getBotOrThrow\(botRegistry, "planner"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "planner"),\n\t\t\tai,',
);
code = code.replace(
	/getBotOrThrow\(botRegistry, "developer-tester"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "developer-tester"),\n\t\t\tai,',
);
code = code.replace(
	/getBotOrThrow\(botRegistry, "quality"\),\n\s*gemini,/g,
	'getBotOrThrow(botRegistry, "quality"),\n\t\t\tai,',
);

fs.writeFileSync("src/dispatch.ts", code);
