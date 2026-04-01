export function truncate(text: string, maxLength: number = 60000): string {
	if (text.length <= maxLength) return text;

	const half = Math.floor((maxLength - 100) / 2);
	return (
		text.substring(0, half) +
		` \n\n... [TRUNCATED ${text.length - maxLength} characters] ...\n\n ` +
		text.substring(text.length - half)
	);
}
