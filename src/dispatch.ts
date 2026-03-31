import { Dispatcher, DispatchEvent } from './core/dispatcher';

// Singleton dispatcher for the application
export const globalDispatcher = new Dispatcher();

/**
 * Handle incoming webhooks, preserving the original routing logic 
 * by acting as an event translator for our internal state machine.
 */
export async function handleWebhook(eventType: string, payload: any): Promise<void> {
    const event: DispatchEvent = {
        type: eventType,
        payload: payload
    };

    console.log(`[Dispatch] Routing webhook event: ${eventType}`);
    
    // Pass the payload through the generic dispatcher to any registered personas/state machines
    await globalDispatcher.dispatch(event);
}

// Example Registration: Preserving the core issue routing logic
globalDispatcher.register('issues', async (event) => {
    // Core state machine logic executes here
    if (event.payload.action === 'opened') {
        console.log(`[State Machine] Triggering triage for issue #${event.payload.issue.number}`);
    }
});

globalDispatcher.register('issue_comment', async (event) => {
    console.log(`[State Machine] Processing comment on issue #${event.payload.issue.number}`);
});