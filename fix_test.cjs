const fs = require("fs");
let content = fs.readFileSync("src/utils/agent_runner.test.ts", "utf8");

content = content.replace(
	/runAutonomousLoop\(([\s\S]*?)5,\n\t\t\);/g,
	'runAutonomousLoop($15,\n\t\t\t{ modelName: "test-model" },\n\t\t);',
);

content = content.replace(
	/5,\n\t\t\t\{\n/g,
	'5,\n\t\t\t{\n\t\t\t\tmodelName: "test-model",\n',
);

fs.writeFileSync("src/utils/agent_runner.test.ts", content);
