import mongoose from 'mongoose';
import os from 'os';

/**
 * Health service interface
 */
interface HealthStatus {
  status: string;
  message: string;
  timestamp: string;
  systemInfo: {
    uptime: string;
    memory: {
      used: string;
      total: string;
    };
    nodeVersion: string;
  };
  database: {
    status: string;
    connected: boolean;
  };
}

/**
 * Health service
 * Business logic for system health checks
 */
export class HealthService {
  /**
   * Get comprehensive system health information
   */
  async getSystemHealth(): Promise<HealthStatus> {
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const usedMemory = totalMemory - os.freemem();

    const databaseStatus = this.getDatabaseStatus();

    return {
      status: 'OK',
      message: 'Matter Traffic Backend is operational',
      timestamp: new Date().toISOString(),
      systemInfo: {
        uptime: `${Math.floor(process.uptime())}s`,
        memory: {
          used: `${Math.round(usedMemory / 1024 / 1024)}MB`,
          total: `${Math.round(totalMemory / 1024 / 1024)}MB`
        },
        nodeVersion: process.version
      },
      database: databaseStatus
    };
  }

  /**
   * Check database connection status
   */
  private getDatabaseStatus() {
    const mongooseState = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      status: states[mongooseState as keyof typeof states] || 'unknown',
      connected: mongooseState === 1
    };
  }
}

// Export singleton instance
export const healthService = new HealthService();