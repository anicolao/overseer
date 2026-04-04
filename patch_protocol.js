const fs = require('fs');
let content = fs.readFileSync('src/utils/agent_protocol.ts', 'utf8');

content = content.replace(
  /export interface PersistWorkAction \{\s*type: "persist_work";\s*\}/,
  'export interface PersistWorkAction {\n\ttype: "persist_work";\n}\n\nexport interface PersistQaAction {\n\ttype: "persist_qa";\n}'
);

content = content.replace(
  /export type AgentAction =\s*\| RunReadOnlyShellAction\s*\| RunShellAction\s*\| PersistWorkAction;/,
  'export type AgentAction =\n\t| RunReadOnlyShellAction\n\t| RunShellAction\n\t| PersistWorkAction\n\t| PersistQaAction;'
);

content = content.replace(
  /`\{"type":"run_ro_shell","command":"\.\.\."\}`,\s*`\{"type":"run_shell","command":"\.\.\."\}`,\s*and\s*`\{"type":"persist_work"\}`/,
  '`{"type":"run_ro_shell","command":"..."}`, `{"type":"run_shell","command":"..."}`, `{"type":"persist_work"}`, and `{"type":"persist_qa"}`'
);

content = content.replace(
  /if \(type === "persist_work"\) \{\s*return \{\s*type: "persist_work",\s*\};\s*\}/,
  'if (type === "persist_work") {\n\t\treturn {\n\t\t\ttype: "persist_work",\n\t\t};\n\t}\n\n\tif (type === "persist_qa") {\n\t\treturn {\n\t\t\ttype: "persist_qa",\n\t\t};\n\t}'
);

content = content.replace(
  /`actions\[\$\{index\}\]\.type must be "run_ro_shell", "run_shell", or "persist_work"`/,
  '`actions[${index}].type must be "run_ro_shell", "run_shell", "persist_work", or "persist_qa"`'
);

fs.writeFileSync('src/utils/agent_protocol.ts', content);
