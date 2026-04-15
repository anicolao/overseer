import * as fs from "fs";

let content = fs.readFileSync("src/utils/github.ts", "utf8");
const newMethods = `
	async clearProjectV2ItemFieldValue(
		projectId: string,
		itemId: string,
		fieldId: string,
	) {
		const query = \`
			mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
				clearProjectV2ItemFieldValue(
					input: {
						projectId: $projectId
						itemId: $itemId
						fieldId: $fieldId
					}
				) {
					projectV2Item {
						id
					}
				}
			}
		\`;

		return this.octokit.graphql(query, {
			projectId,
			itemId,
			fieldId,
		});
	}

	async getProjectItemForIssue(
		issueNodeId: string,
		projectId: string,
	): Promise<string | null> {
		const query = \`
			query($nodeId: ID!) {
				node(id: $nodeId) {
					... on Issue {
						projectItems(first: 10) {
							nodes {
								id
								project {
									id
								}
							}
						}
					}
					... on PullRequest {
						projectItems(first: 10) {
							nodes {
								id
								project {
									id
								}
							}
						}
					}
				}
			}
		\`;

		const response = await this.octokit.graphql<any>(query, { nodeId: issueNodeId });
		const items = response.node?.projectItems?.nodes || [];
		const item = items.find((i: any) => i.project.id === projectId);
		return item ? item.id : null;
	}

	async getProjectV2FieldOptionId(
		fieldId: string,
		optionName: string,
	): Promise<string | null> {
		const query = \`
			query($fieldId: ID!) {
				node(id: $fieldId) {
					... on ProjectV2SingleSelectField {
						options {
							id
							name
						}
					}
				}
			}
		\`;

		const response = await this.octokit.graphql<any>(query, { fieldId });
		const options = response.node?.options || [];
		const option = options.find((o: any) => o.name === optionName);
		return option ? option.id : null;
	}
`;
content = content.replace(
	"async getIssueDetailsFromNodeId",
	newMethods + "\n\tasync getIssueDetailsFromNodeId",
);
fs.writeFileSync("src/utils/github.ts", content);
//# sourceMappingURL=update_github.js.map
