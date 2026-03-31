export interface WebhookPayload {
  action?: string;
  repository?: {
    name: string;
    owner: {
      login: string;
    };
  };
  sender?: {
    login: string;
  };
  [key: string]: any;
}

export interface StandardizedEvent {
  eventName: string;
  action: string | null;
  repoName: string | null;
  repoOwner: string | null;
  actor: string | null;
  rawPayload: WebhookPayload;
}

export type EventHandler = (event: StandardizedEvent) => Promise<void>;

// Dispatch Logic Unification: Routes webhooks uniformly into standardized events mapped to parallel handlers
class Dispatcher {
  private handlers: Map<string, EventHandler[]> = new Map();

  public register(eventName: string, handler: EventHandler): void {
    const current = this.handlers.get(eventName) ?? [];
    current.push(handler);
    this.handlers.set(eventName, current);
  }

  public async dispatch(eventName: string, payload: WebhookPayload): Promise<void> {
    const stdEvent: StandardizedEvent = {
      eventName,
      action: payload.action ?? null,
      repoName: payload.repository?.name ?? null,
      repoOwner: payload.repository?.owner?.login ?? null,
      actor: payload.sender?.login ?? null,
      rawPayload: payload,
    };

    const eventHandlers = this.handlers.get(eventName) || [];
    if (eventHandlers.length === 0) {
      console.log(`[Dispatcher] No handlers registered for event: ${eventName}`);
      return;
    }

    const results = await Promise.allSettled(eventHandlers.map(handler => handler(stdEvent)));
    
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason);

    if (errors.length > 0) {
      console.error(`[Dispatcher] Errors occurred during dispatching ${eventName}:`, errors);
      throw new Error(`Dispatch failed with ${errors.length} error(s).`);
    }
  }

  public clear(): void {
    this.handlers.clear();
  }
}

export const dispatcher = new Dispatcher();