import mongoose, { Schema, Document, Model } from 'mongoose';

export interface INotionMapping extends Document {
  entityType: 'Task' | 'Project' | 'Member' | 'Team' | 'Client';
  notionDatabaseId: string;
  mongoCollection: string;
  isActive: boolean;
  fieldMappings: Record<string, string>;
  lastSync?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotionMappingModel extends Model<INotionMapping> {
  getActiveMapping(entityType: string): Promise<INotionMapping | null>;
  updateLastSync(entityType: string): Promise<void>;
}

const notionMappingSchema = new Schema<INotionMapping>({
  entityType: {
    type: String,
    required: true,
    enum: ['Task', 'Project', 'Member', 'Team', 'Client'],
    unique: true
  },
  notionDatabaseId: {
    type: String,
    required: true
  },
  mongoCollection: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  fieldMappings: {
    type: Map,
    of: String,
    required: true
  },
  lastSync: {
    type: Date
  }
}, {
  timestamps: true
});

notionMappingSchema.index({ entityType: 1 });
notionMappingSchema.index({ isActive: 1 });

notionMappingSchema.statics.getActiveMapping = async function(entityType: string): Promise<INotionMapping | null> {
  return this.findOne({ entityType, isActive: true });
};

notionMappingSchema.statics.updateLastSync = async function(entityType: string): Promise<void> {
  await this.updateOne(
    { entityType },
    { $set: { lastSync: new Date() } }
  );
};

export const NotionMappingModel = mongoose.model<INotionMapping, INotionMappingModel>('NotionMapping', notionMappingSchema);