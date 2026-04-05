import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ShellService, wrapInNixDevelop } from "./shell.js";

describe("wrapInNixDevelop", () => {
	it("wraps plain commands in nix develop", () => {
		expect(wrapInNixDevelop("printf 'hello'")).toBe(
			`nix develop -c bash -lc 'printf '"'"'hello'"'"''`,
		);
	});

	it("does not double-wrap commands already using nix develop", () => {
		expect(wrapInNixDevelop("nix develop -c bash -lc 'pwd'")).toBe(
			"nix develop -c bash -lc 'pwd'",
		);
	});
});

describe("ShellService read-only execution", () => {
	it("prevents writes to repository files in run_ro_shell mode", async () => {
		const repoDir = mkdtempSync(join(tmpdir(), "overseer-shell-test-"));
		const packageJsonPath = join(repoDir, "package.json");
		writeFileSync(packageJsonPath, '{ "name": "fixture" }\n', "utf8");

		try {
			const before = readFileSync(packageJsonPath, "utf8");
			const shell = new ShellService(repoDir, (command) => command);
			const result = await shell.executeCommand(
				"printf '\\n// should not be written\\n' >> package.json",
				"read_only",
			);

			expect(result.exitCode).not.toBe(0);
			expect(readFileSync(packageJsonPath, "utf8")).toBe(before);
		} finally {
			rmSync(repoDir, { recursive: true, force: true });
		}
	});
});
