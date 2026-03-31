export enum ErrorCode {
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  STATE_MUTATION_ERROR = 'STATE_MUTATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export class OverseerError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: any) {
    super(message);
    this.name = 'OverseerError';
    // Maintain prototype chain for instanceof checks
    Object.setPrototypeOf(this, OverseerError.prototype);
  }
}

export const handleError = (error: unknown): never => {
  if (error instanceof OverseerError) {
    throw error; // Deterministic errors are re-thrown safely
  }
  // Wrap swallowed or unknown errors in a strict type boundary
  throw new OverseerError(
    ErrorCode.INTERNAL_ERROR, 
    'An unexpected error occurred', 
    { originalError: error }
  );
};