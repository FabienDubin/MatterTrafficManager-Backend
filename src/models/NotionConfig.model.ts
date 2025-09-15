import mongoose, { Schema, Document } from 'mongoose';

export interface INotionDatabase {
  id: string;
  name: string;
  lastTestDate?: Date;
  lastTestStatus?: 'success' | 'error' | 'pending';
  lastTestMessage?: string;
  entryCount?: number;
}

export interface IFieldMapping {
  applicationField: string;
  notionProperty: string;
  notionType: string;
  isRequired: boolean;
  transformFunction?: string;
}

export interface IDatabaseMapping {
  databaseName: string;
  fields: IFieldMapping[];
  lastMappingDate?: Date;
  mappedFieldsCount: number;
}

export interface IRelationshipValidation {
  from: string;
  to: string;
  field: string;
  isValid: boolean;
  orphanedCount?: number;
  lastValidationDate?: Date;
  validationMessage?: string;
}

export interface INotionConfig extends Document {
  environment: 'development' | 'staging' | 'production';
  notionToken: string;
  databases: {
    teams: INotionDatabase;
    users: INotionDatabase;
    clients: INotionDatabase;
    projects: INotionDatabase;
    traffic: INotionDatabase;
  };
  mappings: IDatabaseMapping[];
  relationships: IRelationshipValidation[];
  autoDetectEnabled: boolean;
  lastAutoDetectDate?: Date;
  createdBy: mongoose.Types.ObjectId;
  updatedBy: mongoose.Types.ObjectId;
  version: number;
  auditLog: Array<{
    timestamp: Date;
    userId: mongoose.Types.ObjectId;
    action: string;
    changes: Record<string, any>;
    ipAddress?: string;
  }>;
}

const NotionDatabaseSchema = new Schema<INotionDatabase>({
  id: { type: String, required: true },
  name: { type: String, required: true },
  lastTestDate: { type: Date },
  lastTestStatus: { 
    type: String, 
    enum: ['success', 'error', 'pending'],
    default: 'pending'
  },
  lastTestMessage: { type: String },
  entryCount: { type: Number }
});

const FieldMappingSchema = new Schema<IFieldMapping>({
  applicationField: { type: String, required: true },
  notionProperty: { type: String, required: true },
  notionType: { type: String, required: true },
  isRequired: { type: Boolean, default: false },
  transformFunction: { type: String }
});

const DatabaseMappingSchema = new Schema<IDatabaseMapping>({
  databaseName: { type: String, required: true },
  fields: [FieldMappingSchema],
  lastMappingDate: { type: Date },
  mappedFieldsCount: { type: Number, default: 0 }
});

const RelationshipValidationSchema = new Schema<IRelationshipValidation>({
  from: { type: String, required: true },
  to: { type: String, required: true },
  field: { type: String, required: true },
  isValid: { type: Boolean, default: false },
  orphanedCount: { type: Number },
  lastValidationDate: { type: Date },
  validationMessage: { type: String }
});

const NotionConfigSchema = new Schema<INotionConfig>(
  {
    environment: {
      type: String,
      enum: ['development', 'staging', 'production'],
      default: 'development',
      required: true
    },
    notionToken: {
      type: String,
      required: true,
      select: false
    },
    databases: {
      teams: {
        type: NotionDatabaseSchema,
        required: true,
        default: {
          id: '268a12bfa99281f886bbd9ffc36be65f',
          name: 'Teams'
        }
      },
      users: {
        type: NotionDatabaseSchema,
        required: true,
        default: {
          id: '268a12bfa99281bf9101ebacbae3e39a',
          name: 'Users'
        }
      },
      clients: {
        type: NotionDatabaseSchema,
        required: true,
        default: {
          id: '268a12bfa99281fb8566e7917a7f8b8e7',
          name: 'Clients'
        }
      },
      projects: {
        type: NotionDatabaseSchema,
        required: true,
        default: {
          id: '268a12bfa9928105a95fde79cea0f6ff',
          name: 'Projects'
        }
      },
      traffic: {
        type: NotionDatabaseSchema,
        required: true,
        default: {
          id: '268a12bfa99281809af5f6a9d2fccbe3',
          name: 'Traffic'
        }
      }
    },
    mappings: [DatabaseMappingSchema],
    relationships: [RelationshipValidationSchema],
    autoDetectEnabled: {
      type: Boolean,
      default: true
    },
    lastAutoDetectDate: { type: Date },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: true
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Member',
      required: true
    },
    version: {
      type: Number,
      default: 1
    },
    auditLog: [{
      timestamp: { type: Date, default: Date.now },
      userId: { 
        type: Schema.Types.ObjectId, 
        ref: 'Member',
        required: true 
      },
      action: { type: String, required: true },
      changes: { type: Schema.Types.Mixed },
      ipAddress: { type: String }
    }]
  },
  {
    timestamps: true,
    collection: 'notionconfigs'
  }
);

// Indexes
NotionConfigSchema.index({ environment: 1 }, { unique: true });
NotionConfigSchema.index({ 'createdBy': 1 });
NotionConfigSchema.index({ 'updatedBy': 1 });
NotionConfigSchema.index({ 'auditLog.timestamp': -1 });

// Pre-save middleware for version management
NotionConfigSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.version += 1;
  }
  next();
});

// Instance methods
NotionConfigSchema.methods.addAuditEntry = function(
  userId: mongoose.Types.ObjectId,
  action: string,
  changes: Record<string, any>,
  ipAddress?: string
) {
  this.auditLog.push({
    timestamp: new Date(),
    userId,
    action,
    changes,
    ipAddress
  });
};

NotionConfigSchema.methods.getActiveMapping = function(databaseName: string): IDatabaseMapping | undefined {
  return this.mappings.find(m => m.databaseName === databaseName);
};

NotionConfigSchema.methods.encryptToken = function(token: string): string {
  const crypto = require('crypto');
  const algorithm = 'aes-256-ctr';
  const secretKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-prod';
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(token), cipher.final()]);
  
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

NotionConfigSchema.methods.decryptToken = function(encryptedToken: string): string {
  const crypto = require('crypto');
  const algorithm = 'aes-256-ctr';
  const secretKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-prod';
  
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey, 'hex'), iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  
  return decrypted.toString();
};

export const NotionConfigModel = mongoose.model<INotionConfig>('NotionConfig', NotionConfigSchema);

export default NotionConfigModel;