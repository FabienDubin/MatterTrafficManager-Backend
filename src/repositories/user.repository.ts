import { IUser, IUserDocument, UserModel, UserRole } from '../models/User.model';
import logger from '../config/logger.config';

/**
 * User repository for database operations
 */
export class UserRepository {
  /**
   * Create a new user
   */
  async create(userData: Partial<IUser>): Promise<IUserDocument> {
    try {
      const user = new UserModel(userData);
      await user.save();
      logger.info(`User created: ${user.email}`);
      return user;
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Find user by email with password
   */
  async findByEmailWithPassword(email: string): Promise<IUserDocument | null> {
    try {
      return await UserModel.findOne({ email: email.toLowerCase() })
        .select('+password')
        .exec();
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by email without password
   */
  async findByEmail(email: string): Promise<IUserDocument | null> {
    try {
      return await UserModel.findOne({ email: email.toLowerCase() }).exec();
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<IUserDocument | null> {
    try {
      return await UserModel.findById(id).exec();
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw error;
    }
  }

  /**
   * Update user by ID
   */
  async updateById(
    id: string,
    updateData: Partial<IUser>
  ): Promise<IUserDocument | null> {
    try {
      const user = await UserModel.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      ).exec();
      
      if (user) {
        logger.info(`User updated: ${user.email}`);
      }
      
      return user;
    } catch (error) {
      logger.error('Error updating user:', error);
      throw error;
    }
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    try {
      await UserModel.findByIdAndUpdate(id, {
        $set: { lastLogin: new Date() },
      }).exec();
      logger.info(`Last login updated for user ID: ${id}`);
    } catch (error) {
      logger.error('Error updating last login:', error);
      throw error;
    }
  }

  /**
   * Delete user by ID
   */
  async deleteById(id: string): Promise<boolean> {
    try {
      const result = await UserModel.findByIdAndDelete(id).exec();
      if (result) {
        logger.info(`User deleted: ${result.email}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw error;
    }
  }

  /**
   * List all users (without passwords)
   */
  async findAll(): Promise<IUserDocument[]> {
    try {
      return await UserModel.find().exec();
    } catch (error) {
      logger.error('Error finding all users:', error);
      throw error;
    }
  }

  /**
   * Count users by role
   */
  async countByRole(role: UserRole): Promise<number> {
    try {
      return await UserModel.countDocuments({ role }).exec();
    } catch (error) {
      logger.error('Error counting users by role:', error);
      throw error;
    }
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    try {
      const count = await UserModel.countDocuments({
        email: email.toLowerCase(),
      }).exec();
      return count > 0;
    } catch (error) {
      logger.error('Error checking email existence:', error);
      throw error;
    }
  }
}

export const userRepository = new UserRepository();