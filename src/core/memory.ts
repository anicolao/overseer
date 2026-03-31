export interface MemoryStore {
  set(key: string, value: any): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<void>;
}

export class PersistentMemory implements MemoryStore {
  private store = new Map<string, any>();

  async set(key: string, value: any): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | null> {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}