import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Static methods interface
 */
interface ISyncLogModel extends Model<ISyncLog> {
  getLatestSync(entityType: string): Promise<ISyncLog | null>;
  getStats(entityType?: string, days?: number): Promise<any[]>;
  isWebhookHealthy(entityType: string): Promise<boolean>;
}

/**
 * Interface for tracking synchronization operations
 */
export interface ISyncLog extends Document {
  entityType: 'Task' | 'Project' | 'Member' | 'Team' | 'Client';
  databaseId: string; // ID de la base Notion source
  syncMethod: 'webhook' | 'polling' | 'manual' | 'initial';
  syncStatus: 'success' | 'failed' | 'partial';
  itemsProcessed: number;
  itemsFailed: number;
  startTime: Date;
  endTime: Date;
  duration: number; // en millisecondes
  syncErrors?: string[]; // Array pour multiples erreurs (renamed to avoid conflict)
  webhookEventId?: string; // Pour tracer les events webhook
  lastWebhookUpdate?: Date;
  lastPollingUpdate?: Date;
  phase?: 'import' | 'denormalization'; // Pour tracking sync 2-phases
  progress?: {
    current: number;
    total: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema for SyncLog
 */
const SyncLogSchema: Schema = new Schema(
  {
    entityType: {
      type: String,
      required: [true, 'Entity type is required'],
      enum: ['Task', 'Project', 'Member', 'Team', 'Client'],
      index: true,
    },
    databaseId: {
      type: String,
      required: [true, 'Database ID is required'],
      index: true,
    },
    syncMethod: {
      type: String,
      required: [true, 'Sync method is required'],
      enum: ['webhook', 'polling', 'manual', 'initial'],
      index: true,
    },
    syncStatus: {
      type: String,
      required: [true, 'Sync status is required'],
      enum: ['success', 'failed', 'partial'],
      default: 'success',
      index: true,
    },
    itemsProcessed: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Items processed cannot be negative'],
    },
    itemsFailed: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Items failed cannot be negative'],
    },
    startTime: {
      type: Date,
      required: [true, 'Start time is required'],
      default: Date.now,
    },
    endTime: {
      type: Date,
      required: [true, 'End time is required'],
    },
    duration: {
      type: Number,
      required: true,
      min: [0, 'Duration cannot be negative'],
    },
    syncErrors: [{
      type: String,
      maxlength: [1000, 'Error message cannot exceed 1000 characters'],
    }],
    webhookEventId: {
      type: String,
      index: true,
      sparse: true,
    },
    lastWebhookUpdate: {
      type: Date,
      index: true,
    },
    lastPollingUpdate: {
      type: Date,
      index: true,
    },
    phase: {
      type: String,
      enum: ['import', 'denormalization'],
    },
    progress: {
      current: {
        type: Number,
        min: 0,
      },
      total: {
        type: Number,
        min: 0,
      }
    }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index composé pour recherche par entity et status
SyncLogSchema.index({ entityType: 1, syncStatus: 1, createdAt: -1 });

// Index pour recherche par méthode et date
SyncLogSchema.index({ syncMethod: 1, createdAt: -1 });

// Index pour recherche des dernières syncs par entity
SyncLogSchema.index({ entityType: 1, createdAt: -1 });

// Index TTL pour auto-suppression des logs anciens (30 jours)
SyncLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

/**
 * Pre-save middleware to calculate duration
 */
SyncLogSchema.pre<ISyncLog>('save', function(next) {
  if (this.endTime && this.startTime) {
    this.duration = this.endTime.getTime() - this.startTime.getTime();
  }
  next();
});

/**
 * Static method to get latest sync for entity
 */
SyncLogSchema.statics.getLatestSync = function(entityType: string) {
  return this.findOne({ entityType })
    .sort({ createdAt: -1 })
    .exec();
};

/**
 * Static method to get sync statistics
 */
SyncLogSchema.statics.getStats = async function(entityType?: string, days: number = 7) {
  const dateFilter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const query: any = { createdAt: { $gte: dateFilter } };
  
  if (entityType) {
    query.entityType = entityType;
  }
  
  return this.aggregate([
    { $match: query },
    {
      $group: {
        _id: {
          entityType: '$entityType',
          syncMethod: '$syncMethod',
          syncStatus: '$syncStatus'
        },
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        totalProcessed: { $sum: '$itemsProcessed' },
        totalFailed: { $sum: '$itemsFailed' }
      }
    }
  ]);
};

/**
 * Static method to check if webhook is healthy
 */
SyncLogSchema.statics.isWebhookHealthy = async function(entityType: string): Promise<boolean> {
  const recentWebhook = await this.findOne({
    entityType,
    syncMethod: 'webhook',
    createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // 5 minutes
  });
  
  return !!recentWebhook;
};

export const SyncLogModel = mongoose.model<ISyncLog, ISyncLogModel>('SyncLog', SyncLogSchema) as ISyncLogModel;