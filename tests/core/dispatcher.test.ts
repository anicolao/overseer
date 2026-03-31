import { Dispatcher } from '../../src/core/dispatcher';
import { globalDispatcher, handleWebhook } from '../../src/dispatch';

describe('Dispatcher Module', () => {
    let testDispatcher: Dispatcher;

    beforeEach(() => {
        testDispatcher = new Dispatcher();
        globalDispatcher.clearHandlers();
    });

    it('should successfully register and dispatch events to handlers', async () => {
        const mockHandler = jest.fn().mockResolvedValue(undefined);
        testDispatcher.register('push', mockHandler);

        const eventPayload = { type: 'push', payload: { commits: [] } };
        await testDispatcher.dispatch(eventPayload);

        expect(mockHandler).toHaveBeenCalledTimes(1);
        expect(mockHandler).toHaveBeenCalledWith(eventPayload);
    });

    it('should support multiple handlers for a single event type', async () => {
        const mockHandler1 = jest.fn().mockResolvedValue(undefined);
        const mockHandler2 = jest.fn().mockResolvedValue(undefined);
        
        testDispatcher.register('ping', mockHandler1);
        testDispatcher.register('ping', mockHandler2);

        await testDispatcher.dispatch({ type: 'ping', payload: {} });

        expect(mockHandler1).toHaveBeenCalledTimes(1);
        expect(mockHandler2).toHaveBeenCalledTimes(1);
    });
});

describe('Webhook Routing Integration', () => {
    beforeEach(() => {
        globalDispatcher.clearHandlers();
    });

    it('should map handleWebhook calls through the global generic dispatcher', async () => {
        const mockIssueHandler = jest.fn();
        globalDispatcher.register('issues', mockIssueHandler);

        await handleWebhook('issues', { action: 'opened', issue: { number: 42 } });

        expect(mockIssueHandler).toHaveBeenCalledWith({
            type: 'issues',
            payload: { action: 'opened', issue: { number: 42 } }
        });
    });
});