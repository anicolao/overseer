const fs = require("fs");
let code = fs.readFileSync("src/bots/bot_config.ts", "utf8");

code = code.replace(
	"allow_persist_work?: boolean;",
	"allow_persist_work?: boolean;\n\tallow_persist_qa?: boolean;",
);

code = code.replace(
	"allowPersistWork: boolean;\n\trequirePostPersistVerification: boolean;",
	"allowPersistWork: boolean;\n\tallowPersistQa: boolean;\n\trequirePostPersistVerification: boolean;",
);

code = code.replace(
	"const allowPersistWork = Boolean(rawBot.allow_persist_work);",
	"const allowPersistWork = Boolean(rawBot.allow_persist_work);\n\tconst allowPersistQa = Boolean(rawBot.allow_persist_qa);",
);

code = code.replace(
	"allowPersistWork,\n\t\trequirePostPersistVerification,",
	"allowPersistWork,\n\t\tallowPersistQa,\n\t\trequirePostPersistVerification,",
);

code = code.replace(
	"allowPersistWork,\n\t\t\trequirePostPersistVerification,",
	"allowPersistWork,\n\t\t\tallowPersistQa,\n\t\t\trequirePostPersistVerification,",
);

code = code.replace(
	"allowPersistWork: boolean;\n\t\trequirePostPersistVerification: boolean;",
	"allowPersistWork: boolean;\n\t\tallowPersistQa: boolean;\n\t\trequirePostPersistVerification: boolean;",
);
code = code.replace(
	"allowPersistWork: boolean;\n\t\trequirePostPersistVerification: boolean;",
	"allowPersistWork: boolean;\n\t\tallowPersistQa: boolean;\n\t\trequirePostPersistVerification: boolean;",
);
code = code.replace(
	"allowPersistWork: boolean;\n\t\trequirePostPersistVerification: boolean;",
	"allowPersistWork: boolean;\n\t\tallowPersistQa: boolean;\n\t\trequirePostPersistVerification: boolean;",
);
code = code.replace(
	"allowPersistWork: boolean;\n\t\trequirePostPersistVerification: boolean;",
	"allowPersistWork: boolean;\n\t\tallowPersistQa: boolean;\n\t\trequirePostPersistVerification: boolean;",
);
code = code.replace(
	"allowPersistWork: boolean;\n\t\trequirePostPersistVerification: boolean;",
	"allowPersistWork: boolean;\n\t\tallowPersistQa: boolean;\n\t\trequirePostPersistVerification: boolean;",
);

code = code.replace(
	/\}\n\n\treturn bullets\.join\("\\n"\);\n\}/,
	'}\n\n\tif (context.allowPersistQa) {\n\t\tbullets.push(\n\t\t\tloadPromptFile(\n\t\t\t\t"prompts/partials/available-actions/persist-qa-enabled.md",\n\t\t\t\trepoRoot,\n\t\t\t).trim(),\n\t\t);\n\t}\n\n\treturn bullets.join("\\n");\n}',
);

fs.writeFileSync("src/bots/bot_config.ts", code);
