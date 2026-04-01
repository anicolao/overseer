import { describe, expect, it } from "vitest";
import { hasExplicitPersonaMention } from "./persona_helper.js";

describe("hasExplicitPersonaMention", () => {
	it("detects an explicit overseer mention in issue text", () => {
		expect(
			hasExplicitPersonaMention(
				"@overseer please review this issue",
				"@overseer",
			),
		).toBe(true);
	});

	it("does not trigger when the issue text is blank", () => {
		expect(hasExplicitPersonaMention("", "@overseer")).toBe(false);
	});

	it("does not trigger on other persona handles", () => {
		expect(
			hasExplicitPersonaMention(
				"@product-architect please review this issue",
				"@overseer",
			),
		).toBe(false);
	});
});
