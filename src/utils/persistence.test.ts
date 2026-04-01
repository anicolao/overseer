import { describe, expect, it } from "vitest";
import { parsePorcelainPaths } from "./persistence.js";

describe("parsePorcelainPaths", () => {
	it("parses added, modified, and untracked entries without status prefixes", () => {
		const output =
			" A flake.lock\0 M package-lock.json\0?? docs/architecture/V2_ARCHITECTURE_DESIGN.md\0";

		expect(parsePorcelainPaths(output)).toEqual([
			"flake.lock",
			"package-lock.json",
			"docs/architecture/V2_ARCHITECTURE_DESIGN.md",
		]);
	});

	it("uses the destination path for renames", () => {
		const output =
			"R  docs/old-name.md\0docs/new-name.md\0?? docs/plans/plan.md\0";

		expect(parsePorcelainPaths(output)).toEqual([
			"docs/new-name.md",
			"docs/plans/plan.md",
		]);
	});
});
