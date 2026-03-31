import { globalDispatcher, handleDispatch, DispatchEvent } from '../src/dispatch';

describe('Dispatcher Flow', () => {
  beforeEach(() => {
    globalDispatcher.clearHandlers();
  });

  it('should register and dispatch events', async () => {
    const mockHandler = jest.fn().mockResolvedValue(undefined);
    globalDispatcher.register('issues', mockHandler);

    const dispatchEvent: DispatchEvent = {
      event: 'issues',
      payload: { action: 'opened', issue: { number: 1 } }
    };

    await globalDispatcher.dispatch(dispatchEvent);

    expect(mockHandler).toHaveBeenCalledWith(dispatchEvent.payload);
  });

  it('should ignore issues without active-persona label in standard flow', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    
    globalDispatcher.register('issues', async (payload: any) => {
      const labels = payload.issue?.labels || [];
      const isActivePersona = labels.some((l: any) => l.name === 'active-persona');

      if (!isActivePersona) {
        console.log('Not an active persona, ignoring.');
        return;
      }
      console.log('Processing active persona state machine for issue:', payload.issue?.number);
    });

    await handleDispatch('issues', { issue: { labels: [] } });
    expect(consoleSpy).toHaveBeenCalledWith('Not an active persona, ignoring.');

    await handleDispatch('issues', { issue: { number: 42, labels: [{ name: 'active-persona' }] } });
    expect(consoleSpy).toHaveBeenCalledWith('Processing active persona state machine for issue:', 42);

    consoleSpy.mockRestore();
  });
});