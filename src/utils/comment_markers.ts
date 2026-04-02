export const STATUS_UPDATE_SENTINEL = "<!-- overseer:status-update -->";
export const PERSISTENCE_BACKSTOP_SENTINEL =
	"<!-- overseer:persistence-backstop -->";

export function prependStatusUpdateSentinel(markdown: string): string {
	const trimmed = markdown.trim();
	if (trimmed.includes(STATUS_UPDATE_SENTINEL)) {
		return trimmed;
	}
	return `${STATUS_UPDATE_SENTINEL}\n\n${trimmed}`;
}

export function hasStatusUpdateSentinel(markdown: string): boolean {
	return markdown.includes(STATUS_UPDATE_SENTINEL);
}

export function hasPersistenceBackstopSentinel(markdown: string): boolean {
	return markdown.includes(PERSISTENCE_BACKSTOP_SENTINEL);
}

export function isWorkflowNoiseComment(markdown: string): boolean {
	return (
		hasStatusUpdateSentinel(markdown) ||
		hasPersistenceBackstopSentinel(markdown)
	);
}
