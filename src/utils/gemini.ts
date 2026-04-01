import type { Content } from "@google/generative-ai";
import {
	type ChatSession,
	type GenerativeModel,
	GoogleGenerativeAI,
} from "@google/generative-ai";
import {
	describeContent,
	installFetchInstrumentation,
	logTrace,
	serializeError,
	textStats,
} from "./trace.js";

export interface PersonaResponse {
	content: string;
	action?: string;
	metadata?: Record<string, any>;
}

export class GeminiService {
	private genAI: GoogleGenerativeAI;
	private model: GenerativeModel;
	private readonly modelName: string;

	constructor(apiKey: string) {
		this.modelName = "gemini-3.1-pro-preview";
		installFetchInstrumentation();
		this.genAI = new GoogleGenerativeAI(apiKey);
		this.model = this.genAI.getGenerativeModel({
			model: this.modelName,
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
		logTrace("gemini.promptPersona.prepare", {
			model: this.modelName,
			systemInstruction: textStats(systemInstruction),
			userMessage: textStats(userMessage),
			context: textStats(context || "No additional context provided."),
			fullPrompt: textStats(fullPrompt),
		});
		while (retries < maxRetries) {
			const attempt = retries + 1;
			const startedAt = Date.now();
			logTrace("gemini.promptPersona.begin", {
				model: this.modelName,
				attempt,
				maxRetries,
			});
			try {
				const result = await this.model.generateContent(fullPrompt);
				const response = await result.response;
				const responseText = response.text();
				logTrace("gemini.promptPersona.success", {
					model: this.modelName,
					attempt,
					durationMs: Date.now() - startedAt,
					responseText: textStats(responseText),
					usageMetadata: response.usageMetadata,
					promptFeedback: response.promptFeedback,
				});
				return responseText;
			} catch (error) {
				retries++;
				logTrace("gemini.promptPersona.error", {
					model: this.modelName,
					attempt,
					durationMs: Date.now() - startedAt,
					error: serializeError(error),
				});
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
		logTrace("gemini.startChat", {
			model: this.modelName,
			systemInstruction: textStats(systemInstruction),
			historyItems: history.length,
		});
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
			const contentSummary = describeContent(content);
			while (retries < maxRetries) {
				const attempt = retries + 1;
				const startedAt = Date.now();
				logTrace("gemini.sendMessage.begin", {
					model: this.modelName,
					attempt,
					maxRetries,
					content: contentSummary,
				});
				try {
					const result = await originalSendMessage(content);
					const response = await result.response;
					logTrace("gemini.sendMessage.success", {
						model: this.modelName,
						attempt,
						durationMs: Date.now() - startedAt,
						candidateCount: response.candidates?.length ?? 0,
						usageMetadata: response.usageMetadata,
						promptFeedback: response.promptFeedback,
					});
					return result;
				} catch (error) {
					retries++;
					logTrace("gemini.sendMessage.error", {
						model: this.modelName,
						attempt,
						durationMs: Date.now() - startedAt,
						error: serializeError(error),
					});
					if (retries === maxRetries) throw error;
					await new Promise((resolve) => setTimeout(resolve, 2000 * retries));
				}
			}
			throw new Error("Gemini sendMessage failed after max retries");
		};

		return chat;
	}
}
