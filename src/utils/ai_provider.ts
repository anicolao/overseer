export interface AiChatSession {
	sendMessage(
		content: string | Array<unknown>,
	): Promise<{ text: string; response: unknown }>;
}

export interface AiService {
	promptPersona(
		systemInstruction: string,
		userMessage: string,
		context?: string,
		modelName?: string,
	): Promise<string>;
	startChat(
		systemInstruction: string,
		history?: unknown[],
		modelName?: string,
	): AiChatSession;
}
