import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface TypeScript pour Project (cache Notion)
 */
export interface IProject extends Document {
  id: string;
  notionId: string; // Unique, indexed
  name: string;
  clientId: string; // Relation vers Client
  status: "new_biz" | "in_progress" | "completed";
  projectLeadId: string; // ID du chef de projet
  
  // Dates
  startDate?: Date;
  endDate?: Date;
  
  // Budget & Hours (calculés depuis rollups/formulas)
  budget?: number;
  allocatedHours?: number;
  effectiveHours?: number;
  
  // Teams & Members
  teamIds: string[]; // IDs des équipes impliquées
  memberIds?: string[]; // Dénormalisé depuis teams
  
  // External links
  driveUrl?: string;
  simoneNumber?: string; // N° de dossier Simone
  
  // Project types
  types?: string[]; // Multi-select
  
  // Visual
  color?: string;
  
  // Dénormalisé pour performance
  clientName?: string;
  
  // Metadata
  lastNotionSync: Date;
  syncedAt?: Date;
  _ttl: Date; // Pour expiration automatique
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schéma Mongoose pour Project avec TTL automatique
 */
const ProjectSchema: Schema = new Schema(
  {
    notionId: {
      type: String,
      required: [true, 'Notion ID is required'],
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [300, 'Name cannot exceed 300 characters'],
    },
    clientId: {
      type: String,
      required: [true, 'Client ID is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['new_biz', 'in_progress', 'completed'],
      default: 'new_biz',
      required: true,
      index: true,
    },
    projectLeadId: {
      type: String,
      required: [true, 'Project lead ID is required'],
      index: true,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
      validate: {
        validator: function(this: IProject, endDate: Date) {
          if (!this.startDate) return true;
          return endDate >= this.startDate;
        },
        message: 'End date must be after or equal to start date'
      }
    },
    budget: {
      type: Number,
      min: [0, 'Budget cannot be negative'],
    },
    allocatedHours: {
      type: Number,
      min: [0, 'Allocated hours cannot be negative'],
    },
    effectiveHours: {
      type: Number,
      min: [0, 'Effective hours cannot be negative'],
    },
    teamIds: [{
      type: String,
      required: true,
    }],
    memberIds: [{
      type: String,
    }],
    driveUrl: {
      type: String,
      match: [
        /^https?:\/\/.+/,
        'Please enter a valid URL'
      ],
    },
    simoneNumber: {
      type: String,
      trim: true,
    },
    types: [{
      type: String,
      trim: true,
    }],
    color: {
      type: String,
      match: [
        /^#[0-9A-Fa-f]{6}$/,
        'Please enter a valid hex color'
      ],
    },
    clientName: {
      type: String,
      trim: true,
    },
    lastNotionSync: {
      type: Date,
      required: true,
      default: Date.now,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
    _ttl: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index TTL pour expiration automatique
ProjectSchema.index({ _ttl: 1 }, { expireAfterSeconds: 0 });

// Index composé pour recherche par status et client
ProjectSchema.index({ status: 1, clientId: 1 });

// Index pour recherche par équipes
ProjectSchema.index({ teamIds: 1 });

// Index pour recherche par dates
ProjectSchema.index({ startDate: 1, endDate: 1 });

/**
 * Méthode statique pour synchronisation depuis Notion
 */
ProjectSchema.statics.upsertFromNotion = async function(notionData: any): Promise<IProject> {
  const filter = { notionId: notionData.notionId };
  const update = {
    ...notionData,
    lastNotionSync: new Date(),
    syncedAt: new Date(),
    _ttl: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Reset TTL
  };
  
  return this.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    runValidators: true,
  });
};

/**
 * Méthode statique pour trouver par client
 */
ProjectSchema.statics.findByClient = function(clientId: string) {
  return this.find({ clientId });
};

/**
 * Méthode statique pour trouver par status
 */
ProjectSchema.statics.findByStatus = function(status: string) {
  return this.find({ status });
};

/**
 * Méthode statique pour trouver les projets actifs
 */
ProjectSchema.statics.findActive = function() {
  return this.find({ status: { $in: ['new_biz', 'in_progress'] } });
};

/**
 * Middleware pre-save pour validation
 */
ProjectSchema.pre<IProject>('save', function (next) {
  // Vérifier que les dates sont cohérentes
  if (this.endDate && this.startDate && this.endDate < this.startDate) {
    next(new Error('End date cannot be before start date'));
    return;
  }
  
  // Mise à jour du TTL à chaque sauvegarde
  if (!this._ttl) {
    this._ttl = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  
  next();
});

export const ProjectModel = mongoose.model<IProject>('Project', ProjectSchema);