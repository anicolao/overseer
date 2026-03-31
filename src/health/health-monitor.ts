export interface SystemStatus {
  status: 'OK' | 'DEGRADED' | 'DOWN';
  timestamp: string;
  uptime: number;
}

export class HealthMonitor {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Performs a health check and returns the current system status.
   */
  public checkHealth(): SystemStatus {
    // For MVP, we assume OK if the process is running. 
    // This can be expanded to check DB connections, memory usage, etc.
    return {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
    };
  }

  private getUptime(): number {
    return (Date.now() - this.startTime) / 1000;
  }
}