const fs = require("fs");
let code = fs.readFileSync("src/dispatch.ts", "utf8");

code = code.replace(
	/if \(process\.env\.VITEST !== "true"\) {[\s\S]*?}\n?$/,
	`if (process.env.VITEST !== "true" && require.main === module) {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (eventPath) {
		const eventData = JSON.parse(fs.readFileSync(eventPath, "utf8"));
		const eventName = process.env.GITHUB_EVENT_NAME || "unknown";
		processDispatchEvent({
			eventName,
			eventData,
			runId: process.env.GITHUB_RUN_ID,
		})
			.then(() => process.exit(0))
			.catch((error) => {
				console.error("Fatal error in dispatcher:", error);
				process.exit(1);
			});
	}
}`,
);

fs.writeFileSync("src/dispatch.ts", code);
