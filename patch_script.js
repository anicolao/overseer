const fs = require('fs');
let code = fs.readFileSync('src/utils/agent_protocol.ts', 'utf8');

code = code.replace(
    'export interface PersistWorkAction {\n\ttype: "persist_work";\n}',
    'export interface PersistWorkAction {\n\ttype: "persist_work";\n}\n\nexport interface PersistQaAction {\n\ttype: "persist_qa";\n}'
);

code = code.replace(
    'export type AgentAction =\n\t| RunReadOnlyShellAction\n\t| RunShellAction\n\t| PersistWorkAction;',
    'export type AgentAction =\n\t| RunReadOnlyShellAction\n\t| RunShellAction\n\t| PersistWorkAction\n\t| PersistQaAction;'
);

code = code.replace(
    '\tif (type === "persist_work") {\n\t\treturn {\n\t\t\ttype: "persist_work",\n\t\t};\n\t}',
    '\tif (type === "persist_work") {\n\t\treturn {\n\t\t\ttype: "persist_work",\n\t\t};\n\t}\n\n\tif (type === "persist_qa") {\n\t\treturn {\n\t\t\ttype: "persist_qa",\n\t\t};\n\t}'
);

code = code.replace(
    '`actions[${index}].type must be "run_ro_shell", "run_shell", or "persist_work"`,',
    '`actions[${index}].type must be "run_ro_shell", "run_shell", "persist_work", or "persist_qa"`,'
);

fs.writeFileSync('src/utils/agent_protocol.ts', code);
