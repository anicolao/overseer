import { dispatcher } from '../src/dispatch';

describe('Dispatcher', () => {
  beforeEach(() => {
    dispatcher.clear();
  });

  it('should correctly standardize the event payload and route to the corresponding handler', async () => {
    const mockHandler = jest.fn().mockResolvedValue(undefined);
    dispatcher.register('issues', mockHandler);

    const payload = {
      action: 'opened',
      repository: {
        name: 'overseer',
        owner: { login: 'test-org' }
      },
      sender: { login: 'anicolao' }
    };

    await dispatcher.dispatch('issues', payload);

    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockHandler).toHaveBeenCalledWith({
      eventName: 'issues',
      action: 'opened',
      repoName: 'overseer',
      repoOwner: 'test-org',
      actor: 'anicolao',
      rawPayload: payload
    });
  });

  it('should gracefully ignore events with no registered handlers', async () => {
    await expect(dispatcher.dispatch('ping', {})).resolves.toBeUndefined();
  });

  it('should throw an aggregate error if one or more handlers fail', async () => {
    const successHandler = jest.fn().mockResolvedValue(undefined);
    const failingHandler = jest.fn().mockRejectedValue(new Error('Simulated failure'));

    dispatcher.register('push', successHandler);
    dispatcher.register('push', failingHandler);

    await expect(dispatcher.dispatch('push', { action: 'push' })).rejects.toThrow('Dispatch failed with 1 error(s).');
    
    // Validates that all handlers run even if one throws (Promise.allSettled)
    expect(successHandler).toHaveBeenCalledTimes(1);
    expect(failingHandler).toHaveBeenCalledTimes(1);
  });
});