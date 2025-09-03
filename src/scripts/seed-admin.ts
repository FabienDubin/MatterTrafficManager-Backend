import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { UserModel, UserRole } from '../models/User.model';
import logger from '../config/logger.config';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Seed admin user
 */
async function seedAdminUser() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27018/mattertraffic';
    
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB for seeding');

    // Check if admin already exists
    const existingAdmin = await UserModel.findOne({ email: 'admin@mattertraffic.fr' });
    
    if (existingAdmin) {
      logger.info('Admin user already exists');
      await mongoose.disconnect();
      return;
    }

    // Create admin user
    const adminUser = new UserModel({
      email: 'admin@mattertraffic.fr',
      password: process.env.NODE_ENV === 'production' ? 'ChangeMe123!' : 'dev123',
      role: UserRole.ADMIN,
      mustChangePassword: process.env.NODE_ENV === 'production',
      createdAt: new Date(),
    });

    await adminUser.save();
    
    logger.info('Admin user created successfully');
    logger.info(`Email: admin@mattertraffic.fr`);
    logger.info(`Password: ${process.env.NODE_ENV === 'production' ? 'ChangeMe123! (MUST BE CHANGED)' : 'dev123'}`);
    
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    
  } catch (error) {
    logger.error('Error seeding admin user:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the seed function
seedAdminUser();