import { describe, expect, it } from "vitest";
import {
	isIgnoredPersistencePath,
	parseNullDelimitedPaths,
} from "./persistence.js";

describe("parseNullDelimitedPaths", () => {
	it("preserves complete filenames from null-delimited git output", () => {
		const output =
			"flake.lock\0package-lock.json\0docs/architecture/V2_ARCHITECTURE_DESIGN.md\0";

		expect(parseNullDelimitedPaths(output)).toEqual([
			"flake.lock",
			"package-lock.json",
			"docs/architecture/V2_ARCHITECTURE_DESIGN.md",
		]);
	});

	it("drops empty records and de-duplicates paths", () => {
		const output = "\0docs/plans/plan.md\0docs/plans/plan.md\0\0";

		expect(parseNullDelimitedPaths(output)).toEqual(["docs/plans/plan.md"]);
	});
});

describe("isIgnoredPersistencePath", () => {
	it("ignores workflow noise paths that should not be persisted", () => {
		expect(isIgnoredPersistencePath("flake.lock")).toBe(true);
		expect(
			isIgnoredPersistencePath(".backstop/persistence-backstop/git-status.txt"),
		).toBe(true);
		expect(isIgnoredPersistencePath("session_architect.log")).toBe(true);
		expect(isIgnoredPersistencePath("docs/design/persist-qa-mvp.md")).toBe(
			false,
		);
	});
});
