import { describe, expect, it } from "vitest";
import { truncate } from "./text.js";

describe("truncate", () => {
	it("should not truncate text shorter than maxLength", () => {
		const text = "Hello world";
		expect(truncate(text, 20)).toBe(text);
	});

	it("should truncate text longer than maxLength", () => {
		const text = "A".repeat(100);
		const result = truncate(text, 50);
		expect(result).toContain("... [TRUNCATED 50 characters] ...");
		expect(result.length).toBeLessThan(100);
	});

	it("should handle edge cases with very small maxLength", () => {
		const text = "Too long for a small limit";
		const result = truncate(text, 10);
		expect(result).toContain("... [TRUNCATED");
	});
});
