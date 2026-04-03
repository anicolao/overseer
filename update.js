const fs = require('fs');

const botsPath = 'bots.json';
const bots = JSON.parse(fs.readFileSync(botsPath, 'utf8'));
const quality = bots.bots.find(b => b.id === 'quality');
quality.shell_access = 'read_write';
quality.allow_run_shell = true;
quality.allow_persist_qa = true;
fs.writeFileSync(botsPath, JSON.stringify(bots, null, 2) + '\n');

const mdPath = 'prompts/quality.md';
let md = fs.readFileSync(mdPath, 'utf8');
md = md.replace(
  'Your final response should summarize findings, verification performed, and any residual risk.',
  'Write detailed QA findings to a file in the `docs/qa/` directory and explicitly call `{"type":"persist_qa"}` to save those reports before concluding.\n\nYour final response should summarize findings, verification performed, and any residual risk.'
);
fs.writeFileSync(mdPath, md);

const path = 'src/bots/bot_config.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  'allow_persist_work?: boolean;',
  'allow_persist_work?: boolean;\n\tallow_persist_qa?: boolean;'
);

code = code.replace(
  'allowPersistWork: boolean;',
  'allowPersistWork: boolean;\n\tallowPersistQa: boolean;'
);

code = code.replace(
  'const allowPersistWork = Boolean(rawBot.allow_persist_work);',
  'const allowPersistWork = Boolean(rawBot.allow_persist_work);\n\tconst allowPersistQa = Boolean(rawBot.allow_persist_qa);'
);

code = code.replace(
  'allowPersistWork,\n\t\tmaxIterations,',
  'allowPersistWork,\n\t\tallowPersistQa,\n\t\tmaxIterations,'
);

code = code.replace(
  'allowPersistWork,\n\t\t\tmaxActionsPerTurn,',
  'allowPersistWork,\n\t\t\tallowPersistQa,\n\t\t\tmaxActionsPerTurn,'
);

code = code.replace(
  /allowPersistWork: boolean;\n\t\tmaxActionsPerTurn: number;/g,
  'allowPersistWork: boolean;\n\t\tallowPersistQa: boolean;\n\t\tmaxActionsPerTurn: number;'
);

code = code.replace(
  /allowPersistWork: boolean;\n\tmaxActionsPerTurn: number;/g,
  'allowPersistWork: boolean;\n\tallowPersistQa: boolean;\n\tmaxActionsPerTurn: number;'
);

code = code.replace(
  /allowPersistWork: boolean;\n}\): string/g,
  'allowPersistWork: boolean;\n\tallowPersistQa: boolean;\n}): string'
);

code = code.replace(
  /\n\treturn bullets\.join\("\\n"\);\n}/,
  `\n\n\tif (context.allowPersistQa) {\n\t\tbullets.push(\n\t\t\t'- \`{"type":"persist_qa"}\` to save detailed QA reports to \`docs/qa/\` before concluding.',\n\t\t);\n\t}\n\n\treturn bullets.join("\\n");\n}`
);

fs.writeFileSync(path, code);
