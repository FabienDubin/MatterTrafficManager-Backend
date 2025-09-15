import mongoose from 'mongoose';
import NotionConfigModel from '../models/NotionConfig.model';

/**
 * Create indexes for NotionConfig collection
 */
async function createNotionConfigIndexes() {
  try {
    console.log('Creating NotionConfig indexes...');
    
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/matter-traffic';
      await mongoose.connect(mongoUri);
      console.log('Connected to MongoDB');
    }

    // Create indexes
    await NotionConfigModel.createIndexes();
    
    // List all indexes to confirm
    const indexes = await NotionConfigModel.collection.getIndexes();
    console.log('NotionConfig indexes created successfully:');
    console.log(JSON.stringify(indexes, null, 2));
    
  } catch (error) {
    console.error('Error creating NotionConfig indexes:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  createNotionConfigIndexes()
    .then(() => {
      console.log('✅ NotionConfig indexes created successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to create NotionConfig indexes:', error);
      process.exit(1);
    });
}

export default createNotionConfigIndexes;