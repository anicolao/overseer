const fs = require('fs');

// 1. src/utils/agent_protocol.ts
let protocol = fs.readFileSync('src/utils/agent_protocol.ts', 'utf8');

protocol = protocol.replace(
`export interface PersistWorkAction {
	type: "persist_work";
}`,
`export interface PersistWorkAction {
	type: "persist_work";
}

export interface PersistQaAction {
	type: "persist_qa";
}`
);

protocol = protocol.replace(
`export type AgentAction = RunShellAction | PersistWorkAction;`,
`export type AgentAction = RunShellAction | PersistWorkAction | PersistQaAction;`
);

protocol = protocol.replace(
`- Available actions: \\`{"type":"run_shell","command":"..."}\\` and \\`{"type":"persist_work"}\\`.`,
`- Available actions: \\`{"type":"run_shell","command":"..."}\\`, \\`{"type":"persist_work"}\\`, and \\`{"type":"persist_qa"}\\`.`
);

protocol = protocol.replace(
`- Use \\`{"type":"persist_work"}\\` only when your persona is authorized to publish repo changes and you want the dispatcher-owned persistence mechanism to commit and push your work.`,
`- Use \\`{"type":"persist_work"}\\` only when your persona is authorized to publish repo changes and you want the dispatcher-owned persistence mechanism to commit and push your work.
- Use \\`{"type":"persist_qa"}\\` specifically for the Quality bot to finalize its QA results.`
);

protocol = protocol.replace(
`	if (type === "persist_work") {
		return {
			type: "persist_work",
		};
	}

	throw new Error(
		\`actions[\${index}].type must be "run_shell" or "persist_work"\`,
	);`,
`	if (type === "persist_work") {
		return {
			type: "persist_work",
		};
	}

	if (type === "persist_qa") {
		return {
			type: "persist_qa",
		};
	}

	throw new Error(
		\`actions[\${index}].type must be "run_shell", "persist_work", or "persist_qa"\`,
	);`
);

fs.writeFileSync('src/utils/agent_protocol.ts', protocol);

// 2. src/utils/agent_runner.ts
let runner = fs.readFileSync('src/utils/agent_runner.ts', 'utf8');

runner = runner.replace(
`export interface AgentRunnerOptions {
	persistWork?: () => Promise<PersistWorkResult>;`,
`export interface AgentRunnerOptions {
	persistWork?: () => Promise<PersistWorkResult>;
	persistQa?: () => Promise<PersistWorkResult>;`
);

runner = runner.replace(
`			if (!options.persistWork) {
				outputs.push(
					JSON.stringify(
						{
							ok: false,
							error_code: "persist_not_available",
							message:
								'persist_work is not available for this persona. Use "run_shell" instead.',
						},
						null,
						2,
					),
				);
				continue;
			}

			const result = await options.persistWork();
			outputs.push(JSON.stringify(result, null, 2));`,
`			if (action.type === "persist_work") {
				if (!options.persistWork) {
					outputs.push(
						JSON.stringify(
							{
								ok: false,
								error_code: "persist_not_available",
								message:
									'persist_work is not available for this persona. Use "run_shell" instead.',
							},
							null,
							2,
						),
					);
					continue;
				}

				const result = await options.persistWork();
				outputs.push(JSON.stringify(result, null, 2));
				continue;
			}

			if (action.type === "persist_qa") {
				if (!options.persistQa) {
					outputs.push(
						JSON.stringify(
							{
								ok: false,
								error_code: "persist_qa_not_available",
								message:
									'persist_qa is not available for this persona. Use "run_shell" instead.',
							},
							null,
							2,
						),
					);
					continue;
				}

				const result = await options.persistQa();
				outputs.push(JSON.stringify(result, null, 2));
				continue;
			}`
);

fs.writeFileSync('src/utils/agent_runner.ts', runner);

// 3. prompts/shared/agent-protocol.md
let sharedPrompt = fs.readFileSync('prompts/shared/agent-protocol.md', 'utf8');

sharedPrompt = sharedPrompt.replace(
`  - \`{"type":"persist_work"}\` for dispatcher-owned persistence when your bot is authorized to publish repository changes`,
`  - \`{"type":"persist_work"}\` for dispatcher-owned persistence when your bot is authorized to publish repository changes
  - \`{"type":"persist_qa"}\` for committing QA metrics and finalizing the QA review process when verified`
);

fs.writeFileSync('prompts/shared/agent-protocol.md', sharedPrompt);

// 4. prompts/quality.md
let qualityPrompt = fs.readFileSync('prompts/quality.md', 'utf8');

qualityPrompt = qualityPrompt.replace(
`Do not fix implementation issues yourself unless the task explicitly asks you to do so.`,
`Do not fix implementation issues yourself unless the task explicitly asks you to do so.

When you have verified the work and updated the QA tracking files, use the \`{"type":"persist_qa"}\` action to commit the QA metrics and finalize the review process.`
);

fs.writeFileSync('prompts/quality.md', qualityPrompt);
