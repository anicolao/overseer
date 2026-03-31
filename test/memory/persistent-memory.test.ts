import { MemorySpikeStore } from '../../src/memory/persistent-memory';

describe('Persistent Memory Spike', () => {
    let store: MemorySpikeStore;

    beforeEach(() => {
        store = new MemorySpikeStore();
    });

    it('should store and retrieve a value', async () => {
        await store.set('testKey', 'testValue');
        const value = await store.get('testKey');
        expect(value).toBe('testValue');
    });

    it('should delete a value successfully', async () => {
        await store.set('testKey', 'testValue');
        await store.delete('testKey');
        const value = await store.get('testKey');
        expect(value).toBeUndefined();
    });
});