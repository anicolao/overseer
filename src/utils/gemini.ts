import type { Content } from "@google/generative-ai";
import {
	type ChatSession,
	type GenerativeModel,
	GoogleGenerativeAI,
} from "@google/generative-ai";

export interface PersonaResponse {
	content: string;
	action?: string;
	metadata?: Record<string, any>;
}

export class GeminiService {
	private genAI: GoogleGenerativeAI;
	private model: GenerativeModel;

	constructor(apiKey: string) {
		this.genAI = new GoogleGenerativeAI(apiKey);
		this.model = this.genAI.getGenerativeModel({
			model: "gemini-3.1-pro-preview",
		});
	}

	async promptPersona(
		systemInstruction: string,
		userMessage: string,
		context?: string,
	): Promise<string> {
		const fullPrompt = `
	SYSTEM INSTRUCTION:
	${systemInstruction}

	CONTEXT:
	${context || "No additional context provided."}

	USER MESSAGE:
	${userMessage}
	    `;

		let retries = 0;
		const maxRetries = 3;
		while (retries < maxRetries) {
			try {
				const result = await this.model.generateContent(fullPrompt);
				const response = await result.response;
				return response.text();
			} catch (error) {
				retries++;
				console.error(
					`Gemini promptPersona failed (attempt ${retries}/${maxRetries}):`,
					error,
				);
				if (retries === maxRetries) throw error;
				await new Promise((resolve) => setTimeout(resolve, 2000 * retries));
			}
		}
		return ""; // Should not be reached
	}

	/**
	 * Starts a stateful chat session for autonomous iteration.
	 */
	startChat(systemInstruction: string, history: Content[] = []): ChatSession {
		const chat = this.model.startChat({
			history,
			systemInstruction: {
				role: "system",
				parts: [{ text: systemInstruction }],
			},
		});

		// Wrap sendMessage with retry logic
		const originalSendMessage = chat.sendMessage.bind(chat);
		chat.sendMessage = async (content) => {
			let retries = 0;
			const maxRetries = 3;
			while (retries < maxRetries) {
				try {
					return await originalSendMessage(content);
				} catch (error) {
					retries++;
					console.error(
						`Gemini sendMessage failed (attempt ${retries}/${maxRetries}):`,
						error,
					);
					if (retries === maxRetries) throw error;
					await new Promise((resolve) => setTimeout(resolve, 2000 * retries));
				}
			}
			throw new Error("Gemini sendMessage failed after max retries");
		};

		return chat;
	}
}
