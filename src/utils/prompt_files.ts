import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const promptFileCache = new Map<string, string>();

export function loadPromptFile(
	relativePath: string,
	repoRoot: string = process.cwd(),
): string {
	const absolutePath = resolve(repoRoot, relativePath);
	const cached = promptFileCache.get(absolutePath);
	if (cached !== undefined) {
		return cached;
	}

	const content = readFileSync(absolutePath, "utf8");
	promptFileCache.set(absolutePath, content);
	return content;
}

export function renderPromptFile(
	relativePath: string,
	replacements: Record<string, string>,
	repoRoot: string = process.cwd(),
): string {
	let content = loadPromptFile(relativePath, repoRoot);
	for (const [key, value] of Object.entries(replacements)) {
		content = content.replaceAll(`{{${key}}}`, value);
	}
	return content;
}
