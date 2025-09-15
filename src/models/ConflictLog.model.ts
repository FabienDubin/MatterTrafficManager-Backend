import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface TypeScript pour ConflictLog (historique des conflits)
 */
export interface IConflictLog extends Document {
  id: string;
  entityType: "task" | "member" | "project" | "client" | "team";
  entityId: string; // ID MongoDB de l'entité
  notionId: string; // ID Notion de l'entité
  conflictType: "update_conflict" | "delete_conflict" | "create_duplicate" | "schema_mismatch";
  resolution: "notion_wins" | "local_wins" | "merged" | "pending" | "manual";
  
  // Détails du conflit
  localData: any; // Données locales au moment du conflit
  notionData: any; // Données Notion au moment du conflit
  mergedData?: any; // Données fusionnées si applicable
  
  // Métadonnées du conflit
  detectedAt: Date; // Quand le conflit a été détecté
  resolvedAt?: Date; // Quand le conflit a été résolu
  resolvedBy?: string; // User qui a résolu le conflit
  autoResolved: boolean; // Si résolu automatiquement
  
  // Informations supplémentaires
  conflictDetails: string; // Description détaillée du conflit
  resolutionNotes?: string; // Notes sur la résolution
  affectedFields?: string[]; // Champs en conflit
  
  // Impact
  severity: "low" | "medium" | "high" | "critical";
  userNotified: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schéma Mongoose pour ConflictLog
 */
const ConflictLogSchema: Schema = new Schema(
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
    conflictType: {
      type: String,
      enum: ['update_conflict', 'delete_conflict', 'create_duplicate', 'schema_mismatch'],
      required: [true, 'Conflict type is required'],
      index: true,
    },
    resolution: {
      type: String,
      enum: ['notion_wins', 'local_wins', 'merged', 'pending', 'manual'],
      default: 'pending',
      required: true,
      index: true,
    },
    localData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    notionData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    mergedData: {
      type: Schema.Types.Mixed,
    },
    detectedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    resolvedAt: {
      type: Date,
      index: true,
    },
    resolvedBy: {
      type: String,
    },
    autoResolved: {
      type: Boolean,
      default: false,
      required: true,
    },
    conflictDetails: {
      type: String,
      required: [true, 'Conflict details are required'],
      trim: true,
      maxlength: [1000, 'Conflict details cannot exceed 1000 characters'],
    },
    resolutionNotes: {
      type: String,
      trim: true,
      maxlength: [500, 'Resolution notes cannot exceed 500 characters'],
    },
    affectedFields: [{
      type: String,
      trim: true,
    }],
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      required: true,
      index: true,
    },
    userNotified: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index composé pour recherche de conflits non résolus
ConflictLogSchema.index({ resolution: 1, severity: 1, detectedAt: -1 });

// Index pour recherche par entité
ConflictLogSchema.index({ entityType: 1, entityId: 1, detectedAt: -1 });

// Index pour les conflits récents
ConflictLogSchema.index({ detectedAt: -1 });

// Index TTL pour supprimer automatiquement les vieux conflits résolus (après 90 jours)
ConflictLogSchema.index(
  { resolvedAt: 1 },
  { 
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { resolution: { $ne: 'pending' } }
  }
);

/**
 * Méthode statique pour créer un log de conflit
 */
ConflictLogSchema.statics.logConflict = async function(
  entityType: string,
  entityId: string,
  notionId: string,
  conflictType: string,
  localData: any,
  notionData: any,
  conflictDetails: string,
  affectedFields?: string[],
  severity: string = 'medium'
): Promise<IConflictLog> {
  return this.create({
    entityType,
    entityId,
    notionId,
    conflictType,
    localData,
    notionData,
    conflictDetails,
    affectedFields,
    severity,
    detectedAt: new Date(),
  });
};

/**
 * Méthode statique pour obtenir les conflits non résolus
 */
ConflictLogSchema.statics.getPendingConflicts = function() {
  return this.find({ resolution: 'pending' })
    .sort({ severity: -1, detectedAt: -1 });
};

/**
 * Méthode statique pour obtenir les conflits par entité
 */
ConflictLogSchema.statics.getByEntity = function(
  entityType: string,
  entityId: string
) {
  return this.find({ entityType, entityId })
    .sort({ detectedAt: -1 });
};

/**
 * Méthode statique pour obtenir les conflits critiques
 */
ConflictLogSchema.statics.getCriticalConflicts = function() {
  return this.find({ 
    severity: 'critical',
    resolution: 'pending'
  }).sort({ detectedAt: -1 });
};

/**
 * Méthode d'instance pour résoudre un conflit
 */
ConflictLogSchema.methods.resolve = async function(
  resolution: string,
  resolvedBy?: string,
  resolutionNotes?: string,
  mergedData?: any
): Promise<IConflictLog> {
  this.resolution = resolution;
  this.resolvedAt = new Date();
  this.resolvedBy = resolvedBy;
  this.resolutionNotes = resolutionNotes;
  
  if (mergedData) {
    this.mergedData = mergedData;
  }
  
  if (!resolvedBy) {
    this.autoResolved = true;
  }
  
  return this.save();
};

/**
 * Méthode d'instance pour marquer comme notifié
 */
ConflictLogSchema.methods.markAsNotified = function(): Promise<IConflictLog> {
  this.userNotified = true;
  return this.save();
};

/**
 * Méthode statique pour obtenir les statistiques de conflits
 */
ConflictLogSchema.statics.getStats = async function(days: number = 30) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return this.aggregate([
    {
      $match: {
        detectedAt: { $gte: cutoffDate }
      }
    },
    {
      $group: {
        _id: {
          entityType: '$entityType',
          conflictType: '$conflictType',
          resolution: '$resolution'
        },
        count: { $sum: 1 },
        avgResolutionTime: {
          $avg: {
            $cond: [
              { $ne: ['$resolvedAt', null] },
              { $subtract: ['$resolvedAt', '$detectedAt'] },
              null
            ]
          }
        }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

export const ConflictLogModel = mongoose.model<IConflictLog>('ConflictLog', ConflictLogSchema);