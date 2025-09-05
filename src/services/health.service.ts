import mongoose from 'mongoose';
import os from 'os';
import { Client } from '@notionhq/client';

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

interface ReadyStatus {
  ready: boolean;
  timestamp: string;
  checks: {
    database: boolean;
    notion: boolean;
  };
}

interface VersionInfo {
  name: string;
  version: string;
  environment: string;
  node: string;
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

  /**
   * Get readiness status for all external dependencies
   */
  async getReadyStatus(): Promise<ReadyStatus> {
    const readyStatus: ReadyStatus = {
      ready: false,
      timestamp: new Date().toISOString(),
      checks: {
        database: false,
        notion: false
      }
    };

    // Check MongoDB connection
    readyStatus.checks.database = mongoose.connection.readyState === 1;

    // Check Notion API (only if key is configured)
    if (process.env.NOTION_API_KEY) {
      try {
        const notion = new Client({
          auth: process.env.NOTION_API_KEY
        });
        
        // Simple call to verify connection - me() requires empty object as param
        await notion.users.me({});
        readyStatus.checks.notion = true;
      } catch (error) {
        console.error('Notion API check failed:', error);
        readyStatus.checks.notion = false;
      }
    } else {
      // If no Notion key configured, consider it OK (optional config)
      readyStatus.checks.notion = true;
    }

    // Service is ready if all checks pass
    readyStatus.ready = readyStatus.checks.database && readyStatus.checks.notion;

    return readyStatus;
  }

  /**
   * Get version information
   */
  getVersionInfo(): VersionInfo {
    return {
      name: 'Matter Traffic Manager Backend',
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      node: process.version
    };
  }
}

// Export singleton instance
export const healthService = new HealthService();