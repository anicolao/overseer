const fs = require('fs');

let botConfig = fs.readFileSync('src/bots/bot_config.ts', 'utf8');
botConfig = botConfig.replace(
  /allow_persist_work\?: boolean;/,
  "allow_persist_work?: boolean;\n\trequire_done_handoff?: boolean;"
);
botConfig = botConfig.replace(
  /allowPersistWork: boolean;/,
  "allowPersistWork: boolean;\n\trequireDoneHandoff: boolean;"
);
botConfig = botConfig.replace(
  /const allowPersistWork = Boolean\(rawBot\.allow_persist_work\);/,
  "const allowPersistWork = Boolean(rawBot.allow_persist_work);\n\tconst requireDoneHandoff = Boolean(rawBot.require_done_handoff);"
);
botConfig = botConfig.replace(
  /allowPersistWork,/,
  "allowPersistWork,\n\t\trequireDoneHandoff,"
);
fs.writeFileSync('src/bots/bot_config.ts', botConfig);

let taskPersona = fs.readFileSync('src/personas/task_persona.ts', 'utf8');
taskPersona = taskPersona.replace(
  /(\t\t\tappendGithubComment: async \(markdown: string\) => \{[\s\S]*?\},)/,
  "$1\n\t\t\trequireDoneHandoff: this.bot.requireDoneHandoff,"
);
fs.writeFileSync('src/personas/task_persona.ts', taskPersona);
