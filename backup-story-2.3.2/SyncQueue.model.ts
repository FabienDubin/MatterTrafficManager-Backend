import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface TypeScript pour SyncQueue (file de synchronisation)
 */
export interface ISyncQueue extends Document {
  id: string;
  entityType: "task" | "member" | "project" | "client" | "team";
  entityId: string; // ID MongoDB de l'entité
  notionId: string; // ID Notion de l'entité
  operation: "create" | "update" | "delete";
  priority: number; // 1 = haute, 2 = normale, 3 = basse
  status: "pending" | "processing" | "completed" | "failed";
  payload: any; // Données à synchroniser
  attempts: number; // Nombre de tentatives
  maxAttempts: number; // Maximum de tentatives
  lastError?: string; // Dernière erreur rencontrée
  nextRetryAt?: Date; // Prochaine tentative
  processedAt?: Date; // Date de traitement
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schéma Mongoose pour SyncQueue
 */
const SyncQueueSchema: Schema = new Schema(
  {
    entityType: {
      type: String,
      enum: ['task', 'member', 'project', 'client', 'team'],
      required: [true, 'Entity type is required'],
      index: true,
    },
    entityId: {
      type: String,
      required: [true, 'Entity ID is required'],
      index: true,
    },
    notionId: {
      type: String,
      required: [true, 'Notion ID is required'],
      index: true,
    },
    operation: {
      type: String,
      enum: ['create', 'update', 'delete'],
      required: [true, 'Operation is required'],
    },
    priority: {
      type: Number,
      min: 1,
      max: 3,
      default: 2,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      required: true,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
      min: 1,
    },
    lastError: {
      type: String,
      trim: true,
    },
    nextRetryAt: {
      type: Date,
      index: true,
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index composé pour optimiser la récupération des tâches à traiter
SyncQueueSchema.index({ status: 1, priority: 1, createdAt: 1 });

// Index pour les tentatives de retry
SyncQueueSchema.index({ status: 1, nextRetryAt: 1 });

// Index pour recherche par entité
SyncQueueSchema.index({ entityType: 1, entityId: 1 });

// Index TTL pour supprimer automatiquement les anciennes entrées complétées (après 7 jours)
SyncQueueSchema.index(
  { processedAt: 1 },
  { 
    expireAfterSeconds: 7 * 24 * 60 * 60,
    partialFilterExpression: { status: 'completed' }
  }
);

/**
 * Méthode statique pour ajouter une tâche de synchronisation
 */
SyncQueueSchema.statics.addTask = async function(
  entityType: string,
  entityId: string,
  notionId: string,
  operation: string,
  payload: any,
  priority: number = 2
): Promise<ISyncQueue> {
  return this.create({
    entityType,
    entityId,
    notionId,
    operation,
    payload,
    priority,
  });
};

/**
 * Méthode statique pour récupérer la prochaine tâche à traiter
 */
SyncQueueSchema.statics.getNextTask = async function(): Promise<ISyncQueue | null> {
  return this.findOneAndUpdate(
    {
      status: 'pending',
      $or: [
        { nextRetryAt: null },
        { nextRetryAt: { $lte: new Date() } }
      ]
    },
    {
      $set: { status: 'processing' },
      $inc: { attempts: 1 }
    },
    {
      new: true,
      sort: { priority: 1, createdAt: 1 }
    }
  );
};

/**
 * Méthode d'instance pour marquer comme complété
 */
SyncQueueSchema.methods.markAsCompleted = function(): Promise<ISyncQueue> {
  this.status = 'completed';
  this.processedAt = new Date();
  return this.save();
};

/**
 * Méthode d'instance pour marquer comme échoué
 */
SyncQueueSchema.methods.markAsFailed = function(error: string): Promise<ISyncQueue> {
  this.lastError = error;
  
  if (this.attempts >= this.maxAttempts) {
    this.status = 'failed';
  } else {
    this.status = 'pending';
    // Exponential backoff pour les retries
    const delayMinutes = Math.pow(2, this.attempts) * 5; // 5, 10, 20, 40 minutes...
    this.nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
  }
  
  return this.save();
};

/**
 * Méthode statique pour nettoyer les anciennes entrées
 */
SyncQueueSchema.statics.cleanup = async function(daysToKeep: number = 30): Promise<any> {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  
  return this.deleteMany({
    status: { $in: ['completed', 'failed'] },
    updatedAt: { $lt: cutoffDate }
  });
};

export const SyncQueueModel = mongoose.model<ISyncQueue>('SyncQueue', SyncQueueSchema);