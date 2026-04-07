import type {
	Content,
	EnhancedGenerateContentResponse,
	Part,
} from "@google/generative-ai";
import {
	type GenerativeModel,
	GoogleGenerativeAI,
} from "@google/generative-ai";
import { AGENT_PROTOCOL_VERSION } from "./agent_protocol.js";
import type { AiChatSession, AiService } from "./ai_provider.js";
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
	metadata?: Record<string, unknown>;
}

export interface GeminiChatResult {
	text: string;
	response: EnhancedGenerateContentResponse;
}

export interface GeminiChatSession extends AiChatSession {
	sendMessage(
		content: string | Array<string | Part>,
	): Promise<GeminiChatResult>;
}

function serializeContentForTrace(
	content: string | Array<string | Part>,
): string {
	if (typeof content === "string") {
		return content;
	}

	return JSON.stringify(content, null, 2);
}

export class GeminiService implements AiService {
	private genAI: GoogleGenerativeAI;
	private readonly defaultModelName: string;
	private readonly requestTimeoutMs: number;

	constructor(apiKey: string) {
		this.defaultModelName = "gemini-3.1-pro-preview";
		this.requestTimeoutMs = Number(
			process.env.GEMINI_REQUEST_TIMEOUT_MS || "120000",
		);
		installFetchInstrumentation();
		this.genAI = new GoogleGenerativeAI(apiKey);
	}

	private getModel(modelName?: string): GenerativeModel {
		return this.genAI.getGenerativeModel({
			model: modelName || this.defaultModelName,
		});
	}

	async promptPersona(
		systemInstruction: string,
		userMessage: string,
		context?: string,
		modelName?: string,
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
			model: modelName || this.defaultModelName,
			systemInstruction: textStats(systemInstruction),
			systemInstructionRaw: systemInstruction,
			userMessage: textStats(userMessage),
			userMessageRaw: userMessage,
			context: textStats(context || "No additional context provided."),
			contextRaw: context || "No additional context provided.",
			fullPrompt: textStats(fullPrompt),
			fullPromptRaw: fullPrompt,
			requestTimeoutMs: this.requestTimeoutMs,
		});
		while (retries < maxRetries) {
			const attempt = retries + 1;
			const startedAt = Date.now();
			const resolvedModelName = modelName || this.defaultModelName;
			logTrace("gemini.promptPersona.begin", {
				model: resolvedModelName,
				attempt,
				maxRetries,
				requestTimeoutMs: this.requestTimeoutMs,
			});
			try {
				const model = this.getModel(modelName);
				const result = await model.generateContent(fullPrompt, {
					timeout: this.requestTimeoutMs,
				});
				const response = await result.response;
				const responseText = response.text();
				logTrace("gemini.promptPersona.success", {
					model: resolvedModelName,
					attempt,
					durationMs: Date.now() - startedAt,
					responseText: textStats(responseText),
					responseTextRaw: responseText,
					usageMetadata: response.usageMetadata,
					promptFeedback: response.promptFeedback,
				});
				return responseText;
			} catch (error) {
				retries++;
				logTrace("gemini.promptPersona.error", {
					model: resolvedModelName,
					attempt,
					durationMs: Date.now() - startedAt,
					error: serializeError(error),
				});
				if (retries === maxRetries) throw error;
				await new Promise((resolve) => setTimeout(resolve, 2000 * retries));
			}
		}
		return "";
	}

	startChat(
		systemInstruction: string,
		history: Content[] = [],
		modelName?: string,
	): GeminiChatSession {
		const resolvedModelName = modelName || this.defaultModelName;
		logTrace("gemini.startChat", {
			model: resolvedModelName,
			systemInstruction: textStats(systemInstruction),
			systemInstructionRaw: systemInstruction,
			historyItems: history.length,
			historyRaw: history,
			requestTimeoutMs: this.requestTimeoutMs,
			responseMimeType: "application/json",
			responseProtocolVersion: AGENT_PROTOCOL_VERSION,
		});
		const chat = this.getModel(resolvedModelName).startChat({
			history,
			systemInstruction: {
				role: "system",
				parts: [{ text: systemInstruction }],
			},
			generationConfig: {
				responseMimeType: "application/json",
			},
		});
		const originalSendMessageStream = chat.sendMessageStream.bind(chat);

		return {
			sendMessage: async (content) => {
				let retries = 0;
				const maxRetries = 3;
				const contentSummary = describeContent(content);
				const contentRaw = serializeContentForTrace(content);

				while (retries < maxRetries) {
					const attempt = retries + 1;
					const startedAt = Date.now();
					logTrace("gemini.sendMessage.begin", {
						model: resolvedModelName,
						attempt,
						maxRetries,
						content: contentSummary,
						contentRaw,
						requestTimeoutMs: this.requestTimeoutMs,
						streaming: true,
					});

					try {
						const result = await originalSendMessageStream(content, {
							timeout: this.requestTimeoutMs,
						});
						let chunkCount = 0;
						let streamedText = "";
						let firstChunkDelayMs: number | undefined;

						for await (const chunk of result.stream) {
							const chunkText = chunk.text();
							chunkCount++;
							streamedText += chunkText;
							if (firstChunkDelayMs === undefined) {
								firstChunkDelayMs = Date.now() - startedAt;
							}
							logTrace("gemini.sendMessage.chunk", {
								model: resolvedModelName,
								attempt,
								chunkIndex: chunkCount,
								chunkText: textStats(chunkText),
								accumulatedText: textStats(streamedText),
								firstChunkDelayMs,
							});
						}

						const response = await result.response;
						const responseText = response.text();
						logTrace("gemini.sendMessage.success", {
							model: resolvedModelName,
							attempt,
							durationMs: Date.now() - startedAt,
							chunkCount,
							firstChunkDelayMs,
							responseText: textStats(responseText),
							responseTextRaw: responseText,
							streamedText: textStats(streamedText),
							streamedTextRaw: streamedText,
							candidateCount: response.candidates?.length ?? 0,
							usageMetadata: response.usageMetadata,
							promptFeedback: response.promptFeedback,
						});

						return {
							text: responseText,
							response,
						};
					} catch (error) {
						retries++;
						logTrace("gemini.sendMessage.error", {
							model: resolvedModelName,
							attempt,
							durationMs: Date.now() - startedAt,
							error: serializeError(error),
						});
						if (retries === maxRetries) throw error;
						await new Promise((resolve) => setTimeout(resolve, 2000 * retries));
					}
				}

				throw new Error("Gemini sendMessage failed after max retries");
			},
		};
	}
}
