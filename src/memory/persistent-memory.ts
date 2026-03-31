export interface PersistentStore {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
}

export class MemorySpikeStore implements PersistentStore {
    private store = new Map<string, any>();

    async get(key: string): Promise<any> {
        return this.store.get(key);
    }

    async set(key: string, value: any): Promise<void> {
        this.store.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }
}