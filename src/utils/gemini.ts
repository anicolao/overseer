import { GoogleGenerativeAI, GenerativeModel, ChatSession, Content } from '@google/generative-ai';

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
            model: "gemini-3.1-pro-preview" 
        });
    }

    async promptPersona(
        systemInstruction: string,
        userMessage: string,
        context?: string
    ): Promise<string> {
        const fullPrompt = `
SYSTEM INSTRUCTION:
${systemInstruction}

CONTEXT:
${context || 'No additional context provided.'}

USER MESSAGE:
${userMessage}
        `;

        const result = await this.model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text();
    }

    /**
     * Starts a stateful chat session for autonomous iteration.
     */
    startChat(systemInstruction: string, history: Content[] = []): ChatSession {
        return this.model.startChat({
            history,
            systemInstruction: {
                role: "system",
                parts: [{ text: systemInstruction }]
            }
        });
    }
}
