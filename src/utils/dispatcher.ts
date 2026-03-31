import { DispatchEvent } from '../dispatch';

type Handler = (payload: any) => Promise<void>;

export class Dispatcher {
  private handlers: Map<string, Handler[]>;

  constructor() {
    this.handlers = new Map();
  }

  public register(event: string, handler: Handler): void {
    const eventHandlers = this.handlers.get(event) || [];
    eventHandlers.push(handler);
    this.handlers.set(event, eventHandlers);
  }

  public async dispatch(dispatchEvent: DispatchEvent): Promise<void> {
    const { event, payload } = dispatchEvent;
    const eventHandlers = this.handlers.get(event) || [];
    for (const handler of eventHandlers) {
      await handler(payload);
    }
  }

  public clearHandlers(): void {
    this.handlers.clear();
  }
}