import fs from "fs";

let protocol = fs.readFileSync("src/utils/agent_protocol.ts", "utf8");
protocol = protocol.replace(
	"export type AgentAction = RunShellAction | PersistWorkAction;",
	'export interface PersistQaAction {\n\ttype: "persist_qa";\n}\n\nexport type AgentAction = RunShellAction | PersistWorkAction | PersistQaAction;',
);

protocol = protocol.replace(
	'- Available actions: \\`{"type":"run_shell","command":"..."}\\` and \\`{"type":"persist_work"}\\`.',
	'- Available actions: \\`{"type":"run_shell","command":"..."}\\`, \\`{"type":"persist_work"}\\`, and \\`{"type":"persist_qa"}\\`.',
);

const oldParseActionEnd = `\tif (type === "persist_work") {\n\t\treturn {\n\t\t\ttype: "persist_work",\n\t\t};\n\t}\n\n\tthrow new Error(\n\t\t\`actions[\${index}].type must be "run_shell" or "persist_work"\`,\n\t);`;

const newParseActionEnd = `\tif (type === "persist_work") {\n\t\treturn {\n\t\t\ttype: "persist_work",\n\t\t};\n\t}\n\n\tif (type === "persist_qa") {\n\t\treturn {\n\t\t\ttype: "persist_qa",\n\t\t};\n\t}\n\n\tthrow new Error(\n\t\t\`actions[\${index}].type must be "run_shell", "persist_work", or "persist_qa"\`,\n\t);`;

protocol = protocol.replace(oldParseActionEnd, newParseActionEnd);
fs.writeFileSync("src/utils/agent_protocol.ts", protocol);

let config = fs.readFileSync("src/bots/bot_config.ts", "utf8");
config = config.replace(
	"allow_persist_work?: boolean;\n\trequire_done_handoff?: boolean;",
	"allow_persist_work?: boolean;\n\tallow_persist_qa?: boolean;\n\trequire_done_handoff?: boolean;",
);

config = config.replace(
	"allowPersistWork: boolean;\n\trequireDoneHandoff: boolean;",
	"allowPersistWork: boolean;\n\tallowPersistQa: boolean;\n\trequireDoneHandoff: boolean;",
);

config = config.replace(
	"const allowPersistWork = Boolean(rawBot.allow_persist_work);\n\tconst requireDoneHandoff = Boolean(rawBot.require_done_handoff);",
	"const allowPersistWork = Boolean(rawBot.allow_persist_work);\n\tconst allowPersistQa = Boolean(rawBot.allow_persist_qa);\n\tconst requireDoneHandoff = Boolean(rawBot.require_done_handoff);",
);

config = config.replace(
	"allowPersistWork,\n\t\trequireDoneHandoff,",
	"allowPersistWork,\n\t\tallowPersistQa,\n\t\trequireDoneHandoff,",
);
fs.writeFileSync("src/bots/bot_config.ts", config);

const bots = JSON.parse(fs.readFileSync("bots.json", "utf8"));
const qualityBot = bots.bots.find((b) => b.id === "quality");
qualityBot.allow_persist_qa = true;
qualityBot.prompt_files = qualityBot.prompt_files.filter(
	(f) => f !== "prompts/shared/read-only-agent.md",
);
fs.writeFileSync("bots.json", JSON.stringify(bots, null, "\t") + "\n");
