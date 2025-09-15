import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface TypeScript pour Team (cache Notion)
 */
export interface ITeam extends Document {
  id: string;
  notionId: string; // Unique, indexed
  name: string;
  description?: string;
  managerId: string; // ID du manager
  
  // External links
  notionSpaceUrl?: string;
  
  // Display
  icon?: string; // Pour affichage UI
  displayOrder: number; // Ordre d'affichage
  
  // Dénormalisé pour performance
  memberCount?: number;
  
  // Metadata
  lastNotionSync: Date;
  syncedAt?: Date;
  _ttl: Date; // Pour expiration automatique
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schéma Mongoose pour Team avec TTL automatique
 */
const TeamSchema: Schema = new Schema(
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
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    managerId: {
      type: String,
      required: [true, 'Manager ID is required'],
      index: true,
    },
    notionSpaceUrl: {
      type: String,
      match: [
        /^https?:\/\/.+/,
        'Please enter a valid URL'
      ],
    },
    icon: {
      type: String,
      maxlength: [50, 'Icon cannot exceed 50 characters'],
    },
    displayOrder: {
      type: Number,
      default: 0,
      index: true,
    },
    memberCount: {
      type: Number,
      min: [0, 'Member count cannot be negative'],
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index TTL pour expiration automatique
TeamSchema.index({ _ttl: 1 }, { expireAfterSeconds: 0 });

// Index pour recherche par manager
TeamSchema.index({ managerId: 1 });

// Index pour tri par ordre d'affichage
TeamSchema.index({ displayOrder: 1 });

/**
 * Méthode statique pour synchronisation depuis Notion
 */
TeamSchema.statics.upsertFromNotion = async function(notionData: any): Promise<ITeam> {
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
 * Méthode statique pour trouver par manager
 */
TeamSchema.statics.findByManager = function(managerId: string) {
  return this.find({ managerId });
};

/**
 * Méthode statique pour obtenir toutes les équipes triées
 */
TeamSchema.statics.findAllSorted = function() {
  return this.find({}).sort({ displayOrder: 1, name: 1 });
};

/**
 * Méthode d'instance pour mettre à jour le compteur de membres
 */
TeamSchema.methods.updateMemberCount = async function(count: number): Promise<ITeam> {
  this.memberCount = count;
  return this.save();
};

/**
 * Middleware pre-save pour validation
 */
TeamSchema.pre<ITeam>('save', function (next) {
  // Mise à jour du TTL à chaque sauvegarde
  if (!this._ttl) {
    this._ttl = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  
  next();
});

export const TeamModel = mongoose.model<ITeam>('Team', TeamSchema);