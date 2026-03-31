import { OverseerError, ErrorCode } from './error-handling';

export class StateManager<T extends object> {
  private currentState: T;

  constructor(initialState: T) {
    // Enforce immutable state flow right at initialization
    this.currentState = Object.freeze({ ...initialState });
  }

  public getState(): T {
    return this.currentState;
  }

  public dispatch(updater: (state: T) => Partial<T>): T {
    try {
      const updates = updater(this.currentState);
      // Ensure strictly immutable transitions
      this.currentState = Object.freeze({ ...this.currentState, ...updates });
      return this.currentState;
    } catch (error) {
      throw new OverseerError(
        ErrorCode.STATE_MUTATION_ERROR, 
        'Failed to apply state transition immutably', 
        { error }
      );
    }
  }
}