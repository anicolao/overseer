import { LLMMockService } from '../../src/core/llm-mock';

describe('LLMMockService', () => {
  it('should return predefined mock responses for isolated testing', async () => {
    const service = new LLMMockService();
    service.setMockResponse('Analyze standard', { content: 'Analysis complete', tokensUsed: 15 });
    
    const response = await service.generateResponse('Analyze standard');
    expect(response.content).toBe('Analysis complete');
    expect(response.tokensUsed).toBe(15);
  });

  it('should throw a strict boundary error for undefined mock interactions', async () => {
    const service = new LLMMockService();
    await expect(service.generateResponse('Unknown Prompt')).rejects.toThrow(
      'No mock response defined for prompt boundary: Unknown Prompt'
    );
  });
});