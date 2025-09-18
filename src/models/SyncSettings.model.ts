import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Interface for sync configuration per entity type
 */
export interface ISyncSettings extends Document {
  entityType: 'Task' | 'Project' | 'Member' | 'Team' | 'Client';
  pollingIntervalMinutes: number; // Intervalle en minutes
  ttlSeconds: number; // TTL MongoDB en secondes
  isWebhookEnabled: boolean;
  lastWebhookSync?: Date;
  lastPollingSync?: Date;
  nextScheduledSync?: Date;
  circuitBreaker: {
    isOpen: boolean;
    failureCount: number;
    lastFailure?: Date;
    reopenAt?: Date;
  };
  retryConfig: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelayMs: number;
  };
  rateLimitConfig: {
    requestsPerSecond: number;
    burstLimit: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for static methods
 */
export interface ISyncSettingsModel extends Model<ISyncSettings> {
  getOrCreate(entityType: string): Promise<ISyncSettings>;
  updateTTL(entityType: string, ttlSeconds: number): Promise<ISyncSettings>;
  isCircuitBreakerOpen(entityType: string): Promise<boolean>;
  tripCircuitBreaker(entityType: string): Promise<void>;
  resetCircuitBreaker(entityType: string): Promise<void>;
  getAllActive(): Promise<ISyncSettings[]>;
}

/**
 * Default configurations per entity type
 */
const DEFAULT_CONFIGS = {
  Task: {
    pollingIntervalMinutes: 60, // 1 hour
    ttlSeconds: 3600, // 1 hour
    requestsPerSecond: 3,
  },
  Project: {
    pollingIntervalMinutes: 1440, // 24 hours
    ttlSeconds: 86400, // 24 hours
    requestsPerSecond: 2,
  },
  Member: {
    pollingIntervalMinutes: 1440, // 24 hours
    ttlSeconds: 604800, // 7 days
    requestsPerSecond: 2,
  },
  Team: {
    pollingIntervalMinutes: 1440, // 24 hours
    ttlSeconds: 604800, // 7 days
    requestsPerSecond: 2,
  },
  Client: {
    pollingIntervalMinutes: 720, // 12 hours
    ttlSeconds: 604800, // 7 days
    requestsPerSecond: 2,
  },
};

/**
 * Schema for SyncSettings
 */
const SyncSettingsSchema: Schema = new Schema(
  {
    entityType: {
      type: String,
      required: [true, 'Entity type is required'],
      enum: ['Task', 'Project', 'Member', 'Team', 'Client'],
      unique: true,
      index: true,
    },
    pollingIntervalMinutes: {
      type: Number,
      required: true,
      min: [5, 'Polling interval must be at least 5 minutes'],
      max: [10080, 'Polling interval cannot exceed 7 days (10080 minutes)'],
      default: 60 // Default will be set based on entityType in pre-save hook
    },
    ttlSeconds: {
      type: Number,
      required: true,
      min: [60, 'TTL must be at least 60 seconds'],
      max: [2592000, 'TTL cannot exceed 30 days (2592000 seconds)'],
      default: 3600 // Default will be set based on entityType in pre-save hook
    },
    isWebhookEnabled: {
      type: Boolean,
      required: true,
      default: true,
    },
    lastWebhookSync: {
      type: Date,
      index: true,
    },
    lastPollingSync: {
      type: Date,
      index: true,
    },
    nextScheduledSync: {
      type: Date,
      index: true,
    },
    circuitBreaker: {
      isOpen: {
        type: Boolean,
        required: true,
        default: false,
      },
      failureCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        max: 100,
      },
      lastFailure: {
        type: Date,
      },
      reopenAt: {
        type: Date,
        index: true,
      }
    },
    retryConfig: {
      maxRetries: {
        type: Number,
        required: true,
        default: 3,
        min: 0,
        max: 10,
      },
      backoffMultiplier: {
        type: Number,
        required: true,
        default: 2,
        min: 1,
        max: 5,
      },
      initialDelayMs: {
        type: Number,
        required: true,
        default: 1000,
        min: 100,
        max: 10000,
      }
    },
    rateLimitConfig: {
      requestsPerSecond: {
        type: Number,
        required: true,
        default: 3,
        min: 1,
        max: 10,
      },
      burstLimit: {
        type: Number,
        required: true,
        default: 5,
        min: 1,
        max: 20,
      }
    }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * Pre-save middleware to set defaults and calculate next scheduled sync
 */
SyncSettingsSchema.pre<ISyncSettings>('save', function(next) {
  // Set default values based on entityType if they're not already set
  if (this.isNew && this.entityType) {
    const config = DEFAULT_CONFIGS[this.entityType as keyof typeof DEFAULT_CONFIGS];
    if (config) {
      if (!this.pollingIntervalMinutes || this.pollingIntervalMinutes === 60) {
        this.pollingIntervalMinutes = config.pollingIntervalMinutes;
      }
      if (!this.ttlSeconds || this.ttlSeconds === 3600) {
        this.ttlSeconds = config.ttlSeconds;
      }
    }
  }
  
  // Calculate next scheduled sync based on polling interval
  if (this.pollingIntervalMinutes && this.lastPollingSync) {
    this.nextScheduledSync = new Date(
      this.lastPollingSync.getTime() + this.pollingIntervalMinutes * 60 * 1000
    );
  }
  
  // Auto-reopen circuit breaker after 5 minutes
  if (this.circuitBreaker.isOpen && this.circuitBreaker.lastFailure) {
    this.circuitBreaker.reopenAt = new Date(
      this.circuitBreaker.lastFailure.getTime() + 5 * 60 * 1000 // 5 minutes
    );
  }
  
  next();
});

/**
 * Static method to get or create settings for entity
 */
SyncSettingsSchema.statics.getOrCreate = async function(entityType: string): Promise<ISyncSettings> {
  let settings = await this.findOne({ entityType });
  
  if (!settings) {
    settings = await this.create({
      entityType,
      pollingIntervalMinutes: DEFAULT_CONFIGS[entityType as keyof typeof DEFAULT_CONFIGS]?.pollingIntervalMinutes || 60,
      ttlSeconds: DEFAULT_CONFIGS[entityType as keyof typeof DEFAULT_CONFIGS]?.ttlSeconds || 3600,
    });
  }
  
  return settings;
};

/**
 * Static method to update TTL for entity
 */
SyncSettingsSchema.statics.updateTTL = async function(entityType: string, ttlSeconds: number): Promise<ISyncSettings> {
  return this.findOneAndUpdate(
    { entityType },
    { ttlSeconds },
    { 
      new: true, 
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );
};

/**
 * Static method to check circuit breaker status
 */
SyncSettingsSchema.statics.isCircuitBreakerOpen = async function(entityType: string): Promise<boolean> {
  const settings = await this.findOne({ entityType });
  
  if (!settings) return false;
  
  // Check if circuit should be reopened
  if (settings.circuitBreaker.isOpen && settings.circuitBreaker.reopenAt) {
    if (new Date() > settings.circuitBreaker.reopenAt) {
      // Reset circuit breaker
      settings.circuitBreaker.isOpen = false;
      settings.circuitBreaker.failureCount = 0;
      await settings.save();
      return false;
    }
  }
  
  return settings.circuitBreaker.isOpen;
};

/**
 * Static method to trip circuit breaker
 */
SyncSettingsSchema.statics.tripCircuitBreaker = async function(entityType: string): Promise<void> {
  const Model = this as ISyncSettingsModel;
  const settings = await Model.getOrCreate(entityType);
  
  settings.circuitBreaker.failureCount += 1;
  
  // Trip after 3 failures
  if (settings.circuitBreaker.failureCount >= 3) {
    settings.circuitBreaker.isOpen = true;
    settings.circuitBreaker.lastFailure = new Date();
  }
  
  await settings.save();
};

/**
 * Static method to reset circuit breaker
 */
SyncSettingsSchema.statics.resetCircuitBreaker = async function(entityType: string): Promise<void> {
  await this.findOneAndUpdate(
    { entityType },
    {
      'circuitBreaker.isOpen': false,
      'circuitBreaker.failureCount': 0,
      'circuitBreaker.lastFailure': null,
      'circuitBreaker.reopenAt': null,
    }
  );
};

/**
 * Static method to get all active settings
 */
SyncSettingsSchema.statics.getAllActive = async function(): Promise<ISyncSettings[]> {
  return this.find({ 'circuitBreaker.isOpen': false });
};

export const SyncSettingsModel = mongoose.model<ISyncSettings, ISyncSettingsModel>('SyncSettings', SyncSettingsSchema);