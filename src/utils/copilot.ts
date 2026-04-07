import { AGENT_PROTOCOL_VERSION } from "./agent_protocol.js";
import type { AiChatSession, AiService } from "./ai_provider.js";
import {
	describeContent,
	installFetchInstrumentation,
	logTrace,
	serializeError,
	textStats,
} from "./trace.js";

export interface CopilotChatResult {
	text: string;
	response: unknown;
}

export interface CopilotChatSession extends AiChatSession {
	sendMessage(content: string | Array<unknown>): Promise<CopilotChatResult>;
}

interface ChatMessage {
	role: string;
	content: string;
}

export class CopilotService implements AiService {
	private readonly apiKey: string;
	private readonly defaultModelName: string;
	private readonly requestTimeoutMs: number;
	private readonly apiUrl: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
		this.defaultModelName = "gpt-4o";
		this.requestTimeoutMs = Number(
			process.env.COPILOT_REQUEST_TIMEOUT_MS || "120000",
		);
		this.apiUrl =
			process.env.COPILOT_API_URL ||
			"https://models.inference.ai.azure.com/chat/completions";
		installFetchInstrumentation();
	}

	private async fetchCompletion(
		messages: ChatMessage[],
		modelName?: string,
		jsonMode = false,
	): Promise<any> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
		try {
			const body: any = {
				model: modelName || this.defaultModelName,
				messages,
			};

			if (jsonMode) {
				body.response_format = { type: "json_object" };
			}

			const response = await fetch(this.apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(
					`Copilot API error: ${response.status} ${response.statusText} - ${text}`,
				);
			}

			return await response.json();
		} finally {
			clearTimeout(timeout);
		}
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
		const resolvedModelName = modelName || this.defaultModelName;
		logTrace("copilot.promptPersona.prepare", {
			model: resolvedModelName,
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
			logTrace("copilot.promptPersona.begin", {
				model: resolvedModelName,
				attempt,
				maxRetries,
				requestTimeoutMs: this.requestTimeoutMs,
			});

			try {
				const result = await this.fetchCompletion(
					[
						{ role: "system", content: systemInstruction },
						{ role: "user", content: fullPrompt },
					],
					resolvedModelName,
				);

				const responseText = result.choices[0]?.message?.content || "";
				logTrace("copilot.promptPersona.success", {
					model: resolvedModelName,
					attempt,
					durationMs: Date.now() - startedAt,
					responseText: textStats(responseText),
					responseTextRaw: responseText,
					usageMetadata: result.usage,
				});
				return responseText;
			} catch (error) {
				retries++;
				logTrace("copilot.promptPersona.error", {
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
		history: any[] = [],
		modelName?: string,
	): CopilotChatSession {
		const resolvedModelName = modelName || this.defaultModelName;
		logTrace("copilot.startChat", {
			model: resolvedModelName,
			systemInstruction: textStats(systemInstruction),
			systemInstructionRaw: systemInstruction,
			historyItems: history.length,
			historyRaw: history,
			requestTimeoutMs: this.requestTimeoutMs,
			responseProtocolVersion: AGENT_PROTOCOL_VERSION,
		});

		// Map existing history (which may be Gemini-formatted) to standard ChatMessages
		const chatHistory: ChatMessage[] = history.map((item) => {
			if (item.role === "model")
				return { role: "assistant", content: item.parts?.[0]?.text || "" };
			if (item.role === "user")
				return { role: "user", content: item.parts?.[0]?.text || "" };
			return {
				role: item.role || "user",
				content: item.content || item.parts?.[0]?.text || "",
			};
		});

		return {
			sendMessage: async (content) => {
				let retries = 0;
				const maxRetries = 3;
				const contentSummary = describeContent(content);
				const contentRaw =
					typeof content === "string"
						? content
						: JSON.stringify(content, null, 2);

				while (retries < maxRetries) {
					const attempt = retries + 1;
					const startedAt = Date.now();
					logTrace("copilot.sendMessage.begin", {
						model: resolvedModelName,
						attempt,
						maxRetries,
						content: contentSummary,
						contentRaw,
						requestTimeoutMs: this.requestTimeoutMs,
						streaming: false,
					});

					try {
						const messages = [
							{ role: "system", content: systemInstruction },
							...chatHistory,
							{
								role: "user",
								content:
									typeof content === "string"
										? content
										: JSON.stringify(content),
							},
						];

						const result = await this.fetchCompletion(
							messages,
							resolvedModelName,
							true,
						);
						const responseText = result.choices?.[0]?.message?.content || "";

						// Add this turn to history
						chatHistory.push({
							role: "user",
							content:
								typeof content === "string" ? content : JSON.stringify(content),
						});
						chatHistory.push({ role: "assistant", content: responseText });

						logTrace("copilot.sendMessage.success", {
							model: resolvedModelName,
							attempt,
							durationMs: Date.now() - startedAt,
							responseText: textStats(responseText),
							responseTextRaw: responseText,
							usageMetadata: result.usage,
						});

						return {
							text: responseText,
							response: result,
						};
					} catch (error) {
						retries++;
						logTrace("copilot.sendMessage.error", {
							model: resolvedModelName,
							attempt,
							durationMs: Date.now() - startedAt,
							error: serializeError(error),
						});
						if (retries === maxRetries) throw error;
						await new Promise((resolve) => setTimeout(resolve, 2000 * retries));
					}
				}

				throw new Error("Copilot sendMessage failed after max retries");
			},
		};
	}
}
