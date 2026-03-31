import { HealthMonitor } from '../../src/health/health-monitor';

describe('HealthMonitor Functional Tests', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    monitor = new HealthMonitor();
  });

  it('should return a system status of OK', () => {
    const result = monitor.checkHealth();
    expect(result.status).toBe('OK');
  });

  it('should include a valid ISO timestamp', () => {
    const result = monitor.checkHealth();
    const parsedDate = Date.parse(result.timestamp);
    expect(isNaN(parsedDate)).toBe(false);
  });

  it('should calculate uptime accurately', (done) => {
    setTimeout(() => {
      const result = monitor.checkHealth();
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.uptime).toBeLessThan(1); // Should be roughly 0.05s
      done();
    }, 50);
  });
});