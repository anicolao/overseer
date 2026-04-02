const fs = require('fs');

// --- agent_protocol.ts ---
let ap = fs.readFileSync('src/utils/agent_protocol.ts', 'utf8');

ap = ap.replace(
  'export interface PersistWorkAction {\n\ttype: "persist_work";\n}',
  'export interface PersistWorkAction {\n\ttype: "persist_work";\n}\n\nexport interface PersistQaAction {\n\ttype: "persist_qa";\n}'
);

ap = ap.replace(
  'export type AgentAction = RunShellAction | PersistWorkAction;',
  'export type AgentAction = RunShellAction | PersistWorkAction | PersistQaAction;'
);

ap = ap.replace(
  '- Available actions: `{"type":"run_shell","command":"..."}` and `{"type":"persist_work"}`.',
  '- Available actions: `{"type":"run_shell","command":"..."}`, `{"type":"persist_work"}`, and `{"type":"persist_qa"}`.'
);

ap = ap.replace(
  '- Use `{"type":"persist_work"}` only when your persona is authorized to publish repo changes and you want the dispatcher-owned persistence mechanism to commit and push your work.',
  '- Use `{"type":"persist_work"}` only when your persona is authorized to publish repo changes and you want the dispatcher-owned persistence mechanism to commit and push your work.\n- Use `{"type":"persist_qa"}` when your persona (like @quality) is authorized to save files to the docs/qa/ directory and you want the dispatcher to commit and push them.'
);

ap = ap.replace(
  /\tif \(type === "persist_work"\) \{\n\t\treturn \{\n\t\t\ttype: "persist_work",\n\t\t\};\n\t\}/,
  `\tif (type === "persist_work") {\n\t\treturn {\n\t\t\ttype: "persist_work",\n\t\t};\n\t}\n\n\tif (type === "persist_qa") {\n\t\treturn {\n\t\t\ttype: "persist_qa",\n\t\t};\n\t}`
);

ap = ap.replace(
  /`actions\[\$\{index\}\]\.type must be "run_shell" or "persist_work"`/,
  '`actions[${index}].type must be "run_shell", "persist_work", or "persist_qa"`'
);

fs.writeFileSync('src/utils/agent_protocol.ts', ap);

// --- agent_runner.ts ---
let ar = fs.readFileSync('src/utils/agent_runner.ts', 'utf8');

ar = ar.replace(
  'export interface AgentRunnerOptions {\n\tpersistWork?: () => Promise<PersistWorkResult>;',
  'export interface AgentRunnerOptions {\n\tpersistWork?: () => Promise<PersistWorkResult>;\n\tpersistQa?: () => Promise<PersistWorkResult>;'
);

const oldLogic = `\t\t\tif (!options.persistWork) {\n\t\t\t\toutputs.push(\n\t\t\t\t\tJSON.stringify(\n\t\t\t\t\t\t{\n\t\t\t\t\t\t\tok: false,\n\t\t\t\t\t\t\terror_code: "persist_not_available",\n\t\t\t\t\t\t\tmessage:\n\t\t\t\t\t\t\t\t\'persist_work is not available for this persona. Use "run_shell" instead.\',\n\t\t\t\t\t\t},\n\t\t\t\t\t\tnull,\n\t\t\t\t\t\t2,\n\t\t\t\t\t),\n\t\t\t\t);\n\t\t\t\tcontinue;\n\t\t\t}\n\n\t\t\tconst result = await options.persistWork();\n\t\t\toutputs.push(JSON.stringify(result, null, 2));`;

const newLogic = `\t\t\tif (action.type === "persist_work") {\n\t\t\t\tif (!options.persistWork) {\n\t\t\t\t\toutputs.push(\n\t\t\t\t\t\tJSON.stringify(\n\t\t\t\t\t\t\t{\n\t\t\t\t\t\t\t\tok: false,\n\t\t\t\t\t\t\t\terror_code: "persist_not_available",\n\t\t\t\t\t\t\t\tmessage:\n\t\t\t\t\t\t\t\t\t\'persist_work is not available for this persona. Use "run_shell" instead.\',\n\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\tnull,\n\t\t\t\t\t\t\t2,\n\t\t\t\t\t\t),\n\t\t\t\t\t);\n\t\t\t\t\tcontinue;\n\t\t\t\t}\n\n\t\t\t\tconst result = await options.persistWork();\n\t\t\t\toutputs.push(JSON.stringify(result, null, 2));\n\t\t\t\tcontinue;\n\t\t\t}\n\n\t\t\tif (action.type === "persist_qa") {\n\t\t\t\tif (!options.persistQa) {\n\t\t\t\t\toutputs.push(\n\t\t\t\t\t\tJSON.stringify(\n\t\t\t\t\t\t\t{\n\t\t\t\t\t\t\t\tok: false,\n\t\t\t\t\t\t\t\terror_code: "persist_qa_not_available",\n\t\t\t\t\t\t\t\tmessage:\n\t\t\t\t\t\t\t\t\t\'persist_qa is not available for this persona. Use "run_shell" instead.\',\n\t\t\t\t\t\t\t},\n\t\t\t\t\t\t\tnull,\n\t\t\t\t\t\t\t2,\n\t\t\t\t\t\t),\n\t\t\t\t\t);\n\t\t\t\t\tcontinue;\n\t\t\t\t}\n\n\t\t\t\tconst result = await options.persistQa();\n\t\t\t\toutputs.push(JSON.stringify(result, null, 2));\n\t\t\t\tcontinue;\n\t\t\t}`;

ar = ar.replace(oldLogic, newLogic);
fs.writeFileSync('src/utils/agent_runner.ts', ar);
