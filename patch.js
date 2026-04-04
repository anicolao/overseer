const fs = require('fs');
let proto = fs.readFileSync('src/utils/agent_protocol.ts', 'utf8');
proto = proto.replace('export interface PersistWorkAction {\n\ttype: "persist_work";\n}', 'export interface PersistWorkAction {\n\ttype: "persist_work";\n}\n\nexport interface PersistQaAction {\n\ttype: "persist_qa";\n}');
proto = proto.replace('export type AgentAction =\n\t| RunReadOnlyShellAction\n\t| RunShellAction\n\t| PersistWorkAction;', 'export type AgentAction =\n\t| RunReadOnlyShellAction\n\t| RunShellAction\n\t| PersistWorkAction\n\t| PersistQaAction;');
proto = proto.replace('`{"type":"run_shell","command":"..."}`, and `{"type":"persist_work"}`.', '`{"type":"run_shell","command":"..."}`, `{"type":"persist_work"}`, and `{"type":"persist_qa"}`.');
proto = proto.replace('- Use `{"type":"persist_work"}` to commit and push all changes made via `run_shell` to the issue branch. Your work is not saved until you call this.', '- Use `{"type":"persist_work"}` to commit and push all changes made via `run_shell` to the issue branch. Your work is not saved until you call this.\n- Use `{"type":"persist_qa"}` to commit and push QA test additions.');
proto = proto.replace('if (type === "persist_work") {\n\t\treturn {\n\t\t\ttype: "persist_work",\n\t\t};\n\t}', 'if (type === "persist_work") {\n\t\treturn {\n\t\t\ttype: "persist_work",\n\t\t};\n\t}\n\n\tif (type === "persist_qa") {\n\t\treturn {\n\t\t\ttype: "persist_qa",\n\t\t};\n\t}');
proto = proto.replace('must be "run_ro_shell", "run_shell", or "persist_work"', 'must be "run_ro_shell", "run_shell", "persist_work", or "persist_qa"');
fs.writeFileSync('src/utils/agent_protocol.ts', proto);

let test = fs.readFileSync('src/utils/agent_protocol.test.ts', 'utf8');
const persistQaTest = `\tit("parses persist_qa actions", () => {\n\t\tconst parsed = parseAgentProtocolResponse(\n\t\t\tJSON.stringify({\n\t\t\t\tversion: AGENT_PROTOCOL_VERSION,\n\t\t\t\tplan: ["Persist the QA additions."],\n\t\t\t\tnext_step: "Persist the QA additions.",\n\t\t\t\tactions: [{ type: "persist_qa" }],\n\t\t\t\ttask_status: "in_progress",\n\t\t\t}),\n\t\t);\n\n\t\texpect(parsed.protocol.actions).toEqual([{ type: "persist_qa" }]);\n\t});\n\n`;
test = test.replace('\tit("parses persist_work actions", () => {', persistQaTest + '\tit("parses persist_work actions", () => {');
fs.writeFileSync('src/utils/agent_protocol.test.ts', test);
