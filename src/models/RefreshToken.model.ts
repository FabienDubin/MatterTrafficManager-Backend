import mongoose, { Document, Schema } from 'mongoose';

/**
 * RefreshToken interface representing the data structure
 */
export interface IRefreshToken {
  token: string;
  userId: string;
  family: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * RefreshToken document interface extending Mongoose Document
 */
export interface IRefreshTokenDocument extends IRefreshToken, Document {}

/**
 * RefreshToken schema definition
 */
const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    family: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index for automatic deletion
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Compound index for efficient queries
 */
refreshTokenSchema.index({ userId: 1, family: 1 });

/**
 * RefreshToken model
 */
export const RefreshTokenModel = mongoose.model<IRefreshTokenDocument>(
  'RefreshToken',
  refreshTokenSchema
);