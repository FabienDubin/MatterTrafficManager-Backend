import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface TypeScript pour Member (utilisateurs Notion)
 */
export interface IMember extends Document {
  id: string;
  notionId: string; // Unique, indexed
  name: string;
  email: string;
  teamIds: string[]; // Relation many-to-many avec les équipes
  teamNames?: string[]; // Dénormalisé pour performance
  role: string[];
  notionUserId?: string; // Link to Notion user profile
  managerId?: string; // ID du manager
  profilePicture?: string; // URL de la photo de profil
  isActive: boolean;
  // Metadata
  lastNotionSync: Date;
  lastModifiedInNotion?: Date; // Date de dernière modif dans Notion
  lastWebhookUpdate?: Date;
  syncedAt?: Date; // Date de dernière sync
  _ttl: Date; // Pour expiration automatique
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schéma Mongoose pour Member
 */
const MemberSchema: Schema = new Schema(
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
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please enter a valid email address'
      ],
    },
    teamIds: [{
      type: String,
      required: true,
    }],
    teamNames: [{
      type: String,
    }],
    role: [{
      type: String,
      required: true,
      trim: true,
    }],
    notionUserId: {
      type: String,
      sparse: true,
      index: true,
    },
    managerId: {
      type: String,
    },
    profilePicture: {
      type: String,
      match: [
        /^https?:\/\/.+/,
        'Please enter a valid URL'
      ],
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    lastNotionSync: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastModifiedInNotion: {
      type: Date,
    },
    lastWebhookUpdate: {
      type: Date,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
    _ttl: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours par défaut
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index TTL pour expiration automatique
MemberSchema.index({ _ttl: 1 }, { expireAfterSeconds: 0 });

// Index composé pour optimiser les requêtes par équipes et statut
MemberSchema.index({ teamIds: 1, isActive: 1 });

// Index pour recherche par email
MemberSchema.index({ email: 1 });

// Index pour recherche par manager
MemberSchema.index({ managerId: 1 });

// Index pour tracking de sync
MemberSchema.index({ lastNotionSync: -1 });
MemberSchema.index({ lastWebhookUpdate: -1 });

/**
 * Méthode statique pour synchronisation depuis Notion
 */
MemberSchema.statics.upsertFromNotion = async function(notionData: any): Promise<IMember> {
  const filter = { notionId: notionData.notionId };
  const update = {
    ...notionData,
    lastNotionSync: new Date(),
    _ttl: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Reset TTL à 7 jours
  };
  
  return this.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    runValidators: true,
  });
};

/**
 * Méthode statique pour trouver par équipes
 */
MemberSchema.statics.findByTeam = function(teamId: string) {
  return this.find({ teamIds: teamId, isActive: true });
};

/**
 * Méthode statique pour trouver par rôle
 */
MemberSchema.statics.findByRole = function(role: string) {
  return this.find({ role: { $in: [role] }, isActive: true });
};

/**
 * Méthode d'instance pour désactiver un membre
 */
MemberSchema.methods.deactivate = function(): Promise<IMember> {
  this.isActive = false;
  return this.save();
};

export const MemberModel = mongoose.model<IMember>('Member', MemberSchema);