export class Dispatcher {
  private handlers: Map<string, Function>;

  constructor() {
    this.handlers = new Map();
  }

  public register(event: string, handler: Function): void {
    this.handlers.set(event, handler);
  }

  public async dispatch(event: string, payload: any): Promise<void> {
    const handler = this.handlers.get(event);
    if (handler) {
      await handler(payload);
    } else {
      console.log(`No handler registered for event: ${event}`);
    }
  }
}