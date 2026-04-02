import { describe, expect, it } from "vitest";
import { wrapInNixDevelop } from "./shell.js";

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
