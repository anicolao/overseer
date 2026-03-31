export interface LLMResponse {
  content: string;
  tokensUsed: number;
}

export class LLMMockService {
  private predefinedResponses: Map<string, LLMResponse> = new Map();

  /**
   * Sets an isolated mock response for testing LLM interactions.
   */
  public setMockResponse(promptKey: string, response: LLMResponse): void {
    this.predefinedResponses.set(promptKey, response);
  }

  /**
   * Generates a deterministic mock response without calling an external API.
   */
  public async generateResponse(prompt: string): Promise<LLMResponse> {
    const response = this.predefinedResponses.get(prompt);
    
    if (!response) {
      return Promise.reject(
        new Error(`No mock response defined for prompt boundary: ${prompt}`)
      );
    }
    
    return Promise.resolve(response);
  }
}