#!/bin/bash
sed -i 's/async persistWork(/async executePersistence(/' src/utils/persistence.ts
sed -i 's/issueNumber: number,/issueNumber: number,/' src/utils/persistence.ts
sed -i 's/persona: string,/persona: string,\n\t\tactionSuffix: string,/' src/utils/persistence.ts
sed -i 's/const commitMessage = `${persona}: issue #${issueNumber} persist work`;/const commitMessage = `${persona}: issue #${issueNumber} persist ${actionSuffix}`;/' src/utils/persistence.ts

# Then insert persistWork and persistQa above executePersistence
sed -i '/async executePersistence(/i \
\tasync persistWork(\n\t\tissueNumber: number,\n\t\tpersona: string,\n\t): Promise<PersistWorkResult> {\n\t\treturn this.executePersistence(issueNumber, persona, "work");\n\t}\n\n\tasync persistQa(\n\t\tissueNumber: number,\n\t\tpersona: string,\n\t): Promise<PersistWorkResult> {\n\t\treturn this.executePersistence(issueNumber, persona, "qa");\n\t}\n' src/utils/persistence.ts

