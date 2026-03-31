import { StateManager } from '../../src/core/state-manager';

describe('StateManager', () => {
  it('should enforce immutable state flow and prevent direct mutations', () => {
    const store = new StateManager({ count: 0, mode: 'MVP' });
    const state = store.getState();
    
    expect(() => {
      // @ts-ignore: Intentionally violating typing to test runtime freeze
      state.count = 1;
    }).toThrow(TypeError); 
  });

  it('should update state safely and immutably via dispatch boundaries', () => {
    const store = new StateManager({ errors: 0, status: 'idle' });
    
    const newState = store.dispatch((state) => ({ errors: state.errors + 1 }));
    
    expect(newState).toEqual({ errors: 1, status: 'idle' });
    expect(store.getState()).toEqual({ errors: 1, status: 'idle' });
  });
});