export interface DispatchEvent {
    type: string;
    payload: any;
}

export type EventHandler = (event: DispatchEvent) => Promise<void>;

/**
 * Generic dispatcher logic decoupled from the webhook handlers.
 * Allows personas and state machines to register dynamic listeners.
 */
export class Dispatcher {
    private handlers: Map<string, EventHandler[]> = new Map();

    public register(eventType: string, handler: EventHandler): void {
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }
        this.handlers.get(eventType)!.push(handler);
    }

    public async dispatch(event: DispatchEvent): Promise<void> {
        const eventHandlers = this.handlers.get(event.type) || [];
        for (const handler of eventHandlers) {
            try {
                await handler(event);
            } catch (error) {
                console.error(`Error handling event ${event.type}:`, error);
                // Depending on the core bot logic, we might not want to halt execution of other handlers
            }
        }
    }

    public clearHandlers(): void {
        this.handlers.clear();
    }
}