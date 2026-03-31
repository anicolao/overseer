import { Dispatcher } from '../../src/core/dispatcher';

describe('Dispatcher Core', () => {
  it('should cleanly register and dispatch an event', async () => {
    const dispatcher = new Dispatcher();
    const mockHandler = jest.fn();
    
    dispatcher.register('test_event', mockHandler);
    await dispatcher.dispatch('test_event', { payloadKey: 'payloadData' });
    
    expect(mockHandler).toHaveBeenCalledWith({ payloadKey: 'payloadData' });
  });

  it('should gracefully handle dispatching an unregistered event without throwing', async () => {
    const dispatcher = new Dispatcher();
    await expect(dispatcher.dispatch('unknown_event', {})).resolves.not.toThrow();
  });
});