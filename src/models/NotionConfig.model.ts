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
  webhookVerificationToken?: string; // Encrypted webhook verification token
  webhookCaptureMode?: {
    enabled: boolean;
    enabledAt: Date;
    capturedEvent?: {
      type: string;
      databaseId?: string;
      timestamp: Date;
      hasSignature: boolean;
    };
  };
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
  isActive: boolean; // To mark active config
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
  // Methods
  encryptWebhookToken(token: string): void;
  decryptWebhookToken(): string | null;
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
    webhookVerificationToken: {
      type: String,
      select: false // Keep encrypted token hidden by default
    },
    webhookCaptureMode: {
      enabled: { type: Boolean, default: false },
      enabledAt: { type: Date },
      capturedEvent: {
        type: { type: String },
        databaseId: { type: String },
        timestamp: { type: Date },
        hasSignature: { type: Boolean }
      }
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
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
          id: '268a12bfa99281fb8566e7917a7f8b8e',
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
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
        ref: 'User',
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
  return this.mappings.find((m: IDatabaseMapping) => m.databaseName === databaseName);
};

NotionConfigSchema.methods.encryptToken = function(token: string): string {
  const crypto = require('crypto');
  const algorithm = 'aes-256-ctr';
  // Use a proper 32-byte key for AES-256
  let secretKey;
  if (process.env.ENCRYPTION_KEY) {
    // If ENCRYPTION_KEY is a hex string, convert it to buffer
    secretKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    if (secretKey.length !== 32) {
      // If not 32 bytes, hash it to get proper length
      secretKey = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
    }
  } else {
    secretKey = crypto.createHash('sha256').update('default-encryption-key-change-in-prod').digest();
  }
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  const encrypted = Buffer.concat([cipher.update(token), cipher.final()]);
  
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

NotionConfigSchema.methods.decryptToken = function(encryptedToken: string): string {
  const crypto = require('crypto');
  const algorithm = 'aes-256-ctr';
  // Use the same 32-byte key for AES-256
  let secretKey;
  if (process.env.ENCRYPTION_KEY) {
    // If ENCRYPTION_KEY is a hex string, convert it to buffer
    secretKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    if (secretKey.length !== 32) {
      // If not 32 bytes, hash it to get proper length
      secretKey = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
    }
  } else {
    secretKey = crypto.createHash('sha256').update('default-encryption-key-change-in-prod').digest();
  }
  
  const parts = encryptedToken.split(':');
  const iv = Buffer.from(parts[0] || '', 'hex');
  const encryptedText = Buffer.from(parts[1] || '', 'hex');
  
  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  
  return decrypted.toString();
};

// Methods for webhook token encryption/decryption
NotionConfigSchema.methods.encryptWebhookToken = function(token: string): void {
  // Use the existing encryptToken method
  this.webhookVerificationToken = this.encryptToken(token);
};

NotionConfigSchema.methods.decryptWebhookToken = function(): string | null {
  if (!this.webhookVerificationToken) {
    return null;
  }
  
  try {
    // Use the existing decryptToken method
    return this.decryptToken(this.webhookVerificationToken);
  } catch (error) {
    console.error('Failed to decrypt webhook token:', error);
    return null;
  }
};

export const NotionConfigModel = mongoose.model<INotionConfig>('NotionConfig', NotionConfigSchema);

export default NotionConfigModel;