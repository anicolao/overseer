const fs = require("fs");
const content = fs.readFileSync("src/dispatch.test.ts", "utf8");

const newContent = content.replace(
	'import { describe, expect, it } from "vitest";',
	'import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";\nimport * as fs from "node:fs";\nimport { GitHubService } from "./utils/github.js";',
);

const newContentWithExport = newContent.replace(
	'        shouldBypassOverseerForArchitectDesignReview,\n} from "./dispatch.js";',
	'        shouldBypassOverseerForArchitectDesignReview,\n        finalizeRun,\n} from "./dispatch.js";',
);

fs.writeFileSync("src/dispatch.test.ts", newContentWithExport);
