import mongoose, { Schema, Document } from 'mongoose';

/**
 * Interface TypeScript pour Member (utilisateurs Notion)
 */
export interface IMember extends Document {
  id: string;
  notionId: string; // Unique, indexed
  name: string;
  email: string;
  teamId: string;
  role: string[];
  isActive: boolean;
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
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address'
      ],
      index: true,
    },
    teamId: {
      type: String,
      required: [true, 'Team ID is required'],
      index: true,
    },
    role: [{
      type: String,
      required: true,
      trim: true,
    }],
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Index composé pour optimiser les requêtes par équipe et statut
MemberSchema.index({ teamId: 1, isActive: 1 });

// Index pour recherche par email
MemberSchema.index({ email: 1 });

/**
 * Méthode statique pour synchronisation depuis Notion
 */
MemberSchema.statics.upsertFromNotion = async function(notionData: any): Promise<IMember> {
  const filter = { notionId: notionData.notionId };
  const update = { ...notionData };
  
  return this.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    runValidators: true,
  });
};

/**
 * Méthode statique pour trouver par équipe
 */
MemberSchema.statics.findByTeam = function(teamId: string) {
  return this.find({ teamId, isActive: true });
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