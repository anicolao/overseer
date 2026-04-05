const fs = require('fs');
let content = fs.readFileSync('src/bots/bot_config.ts', 'utf8');
content = content.replace(/^(\s*)allow_persist_work\?: boolean;/gm, '$1allow_persist_work?: boolean;\n$1allow_persist_qa?: boolean;');
content = content.replace(/^(\s*)allowPersistWork: boolean;/gm, '$1allowPersistWork: boolean;\n$1allowPersistQA: boolean;');
content = content.replace(/^(\s*)const allowPersistWork = Boolean\(rawBot\.allow_persist_work\);/gm, '$1const allowPersistWork = Boolean(rawBot.allow_persist_work);\n$1const allowPersistQA = Boolean(rawBot.allow_persist_qa);');
content = content.replace(/^(\s*)allowPersistWork,/gm, '$1allowPersistWork,\n$1allowPersistQA,');
fs.writeFileSync('src/bots/bot_config.ts', content);
