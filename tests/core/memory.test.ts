import { PersistentMemory } from '../../src/core/memory';

describe('PersistentMemory Functional Tests', () => {
  let memory: PersistentMemory;

  beforeEach(() => {
    memory = new PersistentMemory();
  });

  test('should store and retrieve values correctly', async () => {
    await memory.set('session_1', { role: 'Overseer', active: true });
    const result = await memory.get<{ role: string; active: boolean }>('session_1');
    expect(result).toEqual({ role: 'Overseer', active: true });
  });

  test('should return null for non-existent keys', async () => {
    const result = await memory.get('unknown_session');
    expect(result).toBeNull();
  });

  test('should delete keys successfully', async () => {
    await memory.set('temp_data', 'pending');
    await memory.delete('temp_data');
    const result = await memory.get('temp_data');
    expect(result).toBeNull();
  });
});