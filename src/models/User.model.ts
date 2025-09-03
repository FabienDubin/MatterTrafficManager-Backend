import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import { authConfig } from '../config/auth.config';

/**
 * User role enum
 */
export enum UserRole {
  ADMIN = 'admin',
  TRAFFIC_MANAGER = 'traffic_manager',
  CHEF_PROJET = 'chef_projet',
  DIRECTION = 'direction',
}

/**
 * User interface representing the data structure
 */
export interface IUser {
  email: string;
  password: string;
  role: UserRole;
  memberId?: string;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt?: Date;
  mustChangePassword?: boolean;
  failedLoginAttempts?: number;
  lockedUntil?: Date;
}

/**
 * User document interface extending Mongoose Document
 */
export interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
  incrementFailedAttempts(): Promise<void>;
  resetFailedAttempts(): Promise<void>;
}

/**
 * User schema definition
 */
const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false, // Never expose password by default
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      required: true,
      default: UserRole.TRAFFIC_MANAGER,
    },
    memberId: {
      type: String,
      required: false,
    },
    lastLogin: {
      type: Date,
      required: false,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Pre-save hook to hash password
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const hashedPassword = await bcrypt.hash(this.password, authConfig.bcrypt.rounds);
    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error as Error);
  }
});

/**
 * Compare password method
 */
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

/**
 * Increment failed login attempts
 */
userSchema.methods.incrementFailedAttempts = async function (): Promise<void> {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  
  // Lock account after 5 failed attempts for 15 minutes
  if (this.failedLoginAttempts >= authConfig.rateLimit.maxAttempts) {
    this.lockedUntil = new Date(Date.now() + authConfig.rateLimit.windowMs);
  }
  
  await this.save();
};

/**
 * Reset failed login attempts
 */
userSchema.methods.resetFailedAttempts = async function (): Promise<void> {
  this.failedLoginAttempts = 0;
  this.lockedUntil = undefined;
  await this.save();
};

/**
 * Virtual property to check if account is locked
 */
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockedUntil && this.lockedUntil > new Date());
});

/**
 * User model
 */
export const UserModel = mongoose.model<IUserDocument>('User', userSchema);