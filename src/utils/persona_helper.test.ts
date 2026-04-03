import { describe, expect, it, vi } from "vitest";
import { hasExplicitPersonaMention, isLimitReached } from "./persona_helper.js";

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

describe("isLimitReached", () => {
	it("returns true without posting a comment when the limit is reached", async () => {
		const github = {
			getIssueCommentCount: vi.fn().mockResolvedValue(100),
			getIssue: vi.fn().mockResolvedValue({ data: { body: "" } }),
			addCommentToIssue: vi.fn(),
		};

		await expect(
			isLimitReached(
				github as never,
				"anicolao",
				"overseer",
				59,
				"Overseer",
				"@overseer",
			),
		).resolves.toBe(true);
		expect(github.addCommentToIssue).not.toHaveBeenCalled();
	});

	it("still allows setlimit commands to update the limit", async () => {
		const github = {
			getIssueCommentCount: vi.fn().mockResolvedValue(100),
			getIssue: vi.fn().mockResolvedValue({ data: { body: "" } }),
			addCommentToIssue: vi.fn().mockResolvedValue(undefined),
		};

		await expect(
			isLimitReached(
				github as never,
				"anicolao",
				"overseer",
				59,
				"Overseer",
				"@overseer",
				"@overseer setlimit 250",
			),
		).resolves.toBe(false);
		expect(github.addCommentToIssue).toHaveBeenCalledOnce();
	});
});
