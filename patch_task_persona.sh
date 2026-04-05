#!/bin/bash
sed -i '/: undefined,/a \
\t\t\tpersistQa: this.bot.allowPersistQa\n\t\t\t\t? () => this.persistence.persistQa(issueNumber, this.bot.id)\n\t\t\t\t: undefined,' src/personas/task_persona.ts
