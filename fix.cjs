const fs = require('fs');
let code = fs.readFileSync('src/utils/agent_runner.ts', 'utf8');

code = code.replace(
    /if \(action\.type === "persist_work" \|\| action\.type === "persist_qa"\) \{\s*if \(!options\.persistWork\)/g,
    'if (action.type === "persist_work") {\n\t\t\t\tif (!options.persistWork)'
);

code = code.replace(
    /if \(action\.type === "persist_work" && actionResult\.ok\)/g,
    'if ((action.type === "persist_work" || action.type === "persist_qa") && actionResult.ok)'
);

code = code.replace(
    /if \(action\.type === "persist_work"\) \{\s*state\.verifiedAfterPersist = false;/g,
    'if (action.type === "persist_work" || action.type === "persist_qa") {\n\t\t\tstate.verifiedAfterPersist = false;'
);

code = code.replace(
    /if \(action\.type === "persist_work"\) \{\s*state\.persistSucceededAfterWrite = true;/g,
    'if (action.type === "persist_work" || action.type === "persist_qa") {\n\t\t\tstate.persistSucceededAfterWrite = true;'
);

fs.writeFileSync('src/utils/agent_runner.ts', code);
