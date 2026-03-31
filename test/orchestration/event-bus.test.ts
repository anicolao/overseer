import { EventBus } from '../../src/orchestration/event-bus';

describe('Event Bus Spike', () => {
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
    });

    it('should successfully publish and subscribe to an event', (done) => {
        const testPayload = { message: 'Task Completed', status: 200 };
        
        eventBus.subscribe('task.completed', (payload) => {
            expect(payload).toEqual(testPayload);
            done();
        });

        eventBus.publish('task.completed', testPayload);
    });

    it('should successfully stop listening when unsubscribed', () => {
        const handler = jest.fn(); // Mock function using jest equivalent
        eventBus.subscribe('task.failed', handler);
        eventBus.unsubscribe('task.failed', handler);
        
        eventBus.publish('task.failed', { error: 'Timeout' });
        expect(handler).not.toHaveBeenCalled();
    });
});