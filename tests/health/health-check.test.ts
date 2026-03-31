import { describe, it, expect } from 'vitest';
import { HealthCheck } from '../../src/health/health-check';

describe('HealthCheck MVP Baseline', () => {
  it('should confirm the system status is OK', () => {
    const health = HealthCheck.getSystemStatus();
    expect(health).toBeDefined();
    expect(health.status).toBe('OK');
  });

  it('should indicate readiness for the V2 architecture migration', () => {
    const health = HealthCheck.getSystemStatus();
    expect(health.readyForV2).toBe(true);
  });
});