import { EventEmitter } from 'events';

export class EventBus {
    private emitter: EventEmitter;

    constructor() {
        this.emitter = new EventEmitter();
    }

    publish(event: string, payload: any): void {
        this.emitter.emit(event, payload);
    }

    subscribe(event: string, handler: (payload: any) => void): void {
        this.emitter.on(event, handler);
    }

    unsubscribe(event: string, handler: (payload: any) => void): void {
        this.emitter.off(event, handler);
    }
}