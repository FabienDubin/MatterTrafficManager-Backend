import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { UserModel, UserRole } from '../models/User.model';
import logger from '../config/logger.config';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Test users configuration
 */
const TEST_USERS = [
  {
    email: 'admin@matter.com',
    firstName: 'Admin',
    lastName: 'System',
    password: 'admin123!',
    role: UserRole.ADMIN,
    description: 'Administrateur système',
  },
  {
    email: 'traffic@matter.com',
    firstName: 'Marie',
    lastName: 'Dupont',
    password: 'traffic123!',
    role: UserRole.TRAFFIC_MANAGER,
    description: 'Traffic Manager',
    memberId: 'member-marie-dupont',
  },
  {
    email: 'chef@matter.com',
    firstName: 'Pierre',
    lastName: 'Martin',
    password: 'chef123!',
    role: UserRole.CHEF_PROJET,
    description: 'Chef de projet',
    memberId: 'member-pierre-martin',
  },
  {
    email: 'direction@matter.com',
    firstName: 'Sophie',
    lastName: 'Lefebvre',
    password: 'admin123!',
    role: UserRole.DIRECTION,
    description: 'Direction',
  },
];

/**
 * Seed test users
 */
async function seedTestUsers() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27018/mattertraffic';

    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB for seeding');

    let createdCount = 0;
    let skippedCount = 0;

    // Create each test user
    for (const userData of TEST_USERS) {
      // Check if user already exists
      const existingUser = await UserModel.findOne({ email: userData.email });

      if (existingUser) {
        logger.info(`User ${userData.email} already exists - skipping`);
        skippedCount++;
        continue;
      }

      // Create new user
      const newUser = new UserModel({
        email: userData.email,
        password: userData.password,
        role: userData.role,
        mustChangePassword: false, // Pour les tests, pas besoin de changer
        createdAt: new Date(),
      });

      await newUser.save();
      logger.info(`✅ Created user: ${userData.email} (${userData.description})`);
      createdCount++;
    }

    logger.info('═══════════════════════════════════════');
    logger.info('Seed completed successfully!');
    logger.info(`Created: ${createdCount} users`);
    logger.info(`Skipped: ${skippedCount} users (already existed)`);

    if (createdCount > 0) {
      logger.info('═══════════════════════════════════════');
      logger.info('Test credentials:');
      TEST_USERS.forEach(user => {
        logger.info(`📧 ${user.email} | 🔑 ${user.password} | 👤 ${user.role}`);
      });
    }

    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error('Error seeding test users:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the seed function
seedTestUsers();
