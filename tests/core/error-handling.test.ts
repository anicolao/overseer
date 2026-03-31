import { OverseerError, ErrorCode, handleError } from '../../src/core/error-handling';

describe('Error Handling', () => {
  it('should correctly instantiate OverseerError with specific details', () => {
    const err = new OverseerError(ErrorCode.LLM_TIMEOUT, 'LLM timed out');
    expect(err.code).toBe(ErrorCode.LLM_TIMEOUT);
    expect(err.message).toBe('LLM timed out');
    expect(err.name).toBe('OverseerError');
  });

  it('should deterministically wrap unknown errors without swallowing them', () => {
    expect(() => handleError(new Error('Random unhandled exception'))).toThrow(OverseerError);
    
    try {
      handleError(new Error('Random unhandled exception'));
    } catch (e) {
      const error = e as OverseerError;
      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.details.originalError).toBeDefined();
    }
  });

  it('should pass through existing OverseerErrors safely', () => {
    const knownError = new OverseerError(ErrorCode.VALIDATION_ERROR, 'Invalid input');
    expect(() => handleError(knownError)).toThrow(knownError);
  });
});