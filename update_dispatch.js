import * as fs from "fs";

let content = fs.readFileSync("src/dispatch.ts", "utf8");
const oldCode = `	// 3. Update State
	await github.setActivePersona(owner, repo, issueNumber, nextPersona);`;
const newCode = `	// 3. Update State
	const projectId = process.env.PROJECT_ID;
	const fieldId = process.env.FIELD_ID;

	if (projectId && fieldId) {
		try {
			const issueData = await github.getIssue(owner, repo, issueNumber);
			const issueNodeId = issueData.data.node_id;
			const itemId = await github.getProjectItemForIssue(issueNodeId, projectId);

			if (itemId) {
				if (nextPersona) {
					const personaToOptionMap: Record<string, string> = {
						"overseer": "Triage",
						"product-architect": "Architecting",
						"planner": "Planning",
						"developer-tester": "Implementing",
						"quality": "Reviewing",
					};
					const optionName = personaToOptionMap[nextPersona];
					
					if (optionName) {
						const optionId = await github.getProjectV2FieldOptionId(fieldId, optionName);
						if (optionId) {
							await github.updateProjectV2ItemFieldValue(projectId, itemId, fieldId, optionId);
						} else {
							console.log(\`Could not find optionId for status: \${optionName}\`);
						}
					}
				} else {
					await github.clearProjectV2ItemFieldValue(projectId, itemId, fieldId);
				}
			} else {
				console.log(\`Task is not tracked by project \${projectId}, falling back to labels.\`);
				await github.setActivePersona(owner, repo, issueNumber, nextPersona);
			}
		} catch (error) {
			console.error("Failed to update Projects V2 field, falling back to labels.", error);
			await github.setActivePersona(owner, repo, issueNumber, nextPersona);
		}
	} else {
		await github.setActivePersona(owner, repo, issueNumber, nextPersona);
	}`;
content = content.replace(oldCode, newCode);
fs.writeFileSync("src/dispatch.ts", content);
//# sourceMappingURL=update_dispatch.js.map
