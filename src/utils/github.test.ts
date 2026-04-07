import { describe, expect, it, vi } from "vitest";
import { GitHubService } from "./github.js";

describe("GitHubService", () => {
	describe("updateProjectV2ItemFieldValue", () => {
		it("constructs and executes the correct GraphQL mutation", async () => {
			const github = new GitHubService("dummy-token");

			const mockGraphql = vi.fn().mockResolvedValue({
				projectV2Item: { id: "item-id" },
			});
			// @ts-expect-error - overriding readonly property for testing
			github.octokit = { graphql: mockGraphql };

			await github.updateProjectV2ItemFieldValue(
				"project-id",
				"item-id",
				"field-id",
				"option-id",
			);

			expect(mockGraphql).toHaveBeenCalledWith(
				expect.stringContaining(
					"mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!)",
				),
				{
					projectId: "project-id",
					itemId: "item-id",
					fieldId: "field-id",
					optionId: "option-id",
				},
			);
		});
	});
});
