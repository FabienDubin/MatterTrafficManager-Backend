import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface TypeScript pour Client (cache Notion)
 */
export interface IClient extends Document {
  id: string;
  notionId: string; // Unique, indexed
  name: string;
  status: "active" | "inactive" | "retainer";
  emoji?: string; // Pour identification visuelle
  
  // Contact information
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  
  // Client types
  types?: string[]; // Multi-select
  
  // External links
  driveUrl?: string;
  logoUrl?: string;
  
  // Notes
  notes?: string;
  
  // Metrics (calculés depuis rollups)
  activeProjectsCount?: number;
  
  // Metadata
  lastNotionSync: Date;
  syncedAt?: Date;
  _ttl: Date; // Pour expiration automatique
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * Schéma Mongoose pour Client avec TTL automatique
 */
const ClientSchema: Schema = new Schema(
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
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'retainer'],
      default: 'active',
      required: true,
    },
    emoji: {
      type: String,
      maxlength: [10, 'Emoji cannot exceed 10 characters'],
    },
    primaryContactName: {
      type: String,
      trim: true,
      maxlength: [200, 'Contact name cannot exceed 200 characters'],
    },
    primaryContactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please enter a valid email address'
      ],
    },
    primaryContactPhone: {
      type: String,
      trim: true,
      match: [
        /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}$/,
        'Please enter a valid phone number'
      ],
    },
    types: [{
      type: String,
      trim: true,
    }],
    driveUrl: {
      type: String,
      match: [
        /^https?:\/\/.+/,
        'Please enter a valid URL'
      ],
    },
    logoUrl: {
      type: String,
      match: [
        /^https?:\/\/.+/,
        'Please enter a valid URL'
      ],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    activeProjectsCount: {
      type: Number,
      min: [0, 'Active projects count cannot be negative'],
      default: 0,
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
    createdBy: {
      type: String,
    },
    updatedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index TTL pour expiration automatique
ClientSchema.index({ _ttl: 1 }, { expireAfterSeconds: 0 });

// Index pour recherche par status
ClientSchema.index({ status: 1 });

// Index pour recherche par types
ClientSchema.index({ types: 1 });

// Index pour recherche par email de contact
ClientSchema.index({ primaryContactEmail: 1 });

/**
 * Méthode statique pour synchronisation depuis Notion
 */
ClientSchema.statics.upsertFromNotion = async function(notionData: any): Promise<IClient> {
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
 * Méthode statique pour trouver les clients actifs
 */
ClientSchema.statics.findActive = function() {
  return this.find({ status: { $in: ['active', 'retainer'] } });
};

/**
 * Méthode statique pour trouver par type
 */
ClientSchema.statics.findByType = function(type: string) {
  return this.find({ types: type });
};

/**
 * Méthode statique pour trouver par statut
 */
ClientSchema.statics.findByStatus = function(status: string) {
  return this.find({ status });
};

/**
 * Méthode d'instance pour marquer comme inactif
 */
ClientSchema.methods.deactivate = function(): Promise<IClient> {
  this.status = 'inactive';
  return this.save();
};


/**
 * Middleware pre-save pour validation
 */
ClientSchema.pre<IClient>('save', function (next) {
  // Mise à jour du TTL à chaque sauvegarde
  if (!this._ttl) {
    this._ttl = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  
  next();
});

export const ClientModel = mongoose.model<IClient>('Client', ClientSchema);