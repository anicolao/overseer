import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

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
        // Using Gemini 3.1 Pro Preview as requested (migrating from deprecated 3.0)
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
}
