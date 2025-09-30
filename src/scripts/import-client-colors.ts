import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.config';
import { ConfigModel } from '../models/Config.model';
import { entityService } from '../services/notion/entity.service';
import logger from '../config/logger.config';
import fs from 'fs/promises';
import path from 'path';

interface ClientColorData {
  clientId: string;
  clientName: string;
  color: string;
}

async function importClientColors() {
  try {
    await connectDB();
    logger.info('Connected to database');

    // Read the JSON file
    const filePath = process.argv[2];
    if (!filePath) {
      console.error('Please provide the path to the JSON file as an argument');
      console.log('Usage: npm run import:colors /path/to/colors.json');
      process.exit(1);
    }

    const absolutePath = path.resolve(filePath);
    logger.info(`Reading colors from: ${absolutePath}`);

    const fileContent = await fs.readFile(absolutePath, 'utf-8');
    const colorData: ClientColorData[] = JSON.parse(fileContent);

    logger.info(`Found ${colorData.length} client color entries in JSON`);

    // Get current clients from Notion
    console.log('\n📊 Fetching clients from Notion...');
    const notionClients = await entityService.getAllClients();
    logger.info(`Found ${notionClients.length} clients in Notion`);

    // Create a map of client names to colors from JSON
    const nameToColorMap = new Map<string, string>();
    const processedNames = new Set<string>();
    
    colorData.forEach(entry => {
      if (entry.clientName && entry.color) {
        // Normalize client name for better matching
        const normalizedName = entry.clientName.toLowerCase().trim();
        // Keep only the first occurrence of each client name (best color)
        if (!processedNames.has(normalizedName)) {
          nameToColorMap.set(normalizedName, entry.color);
          processedNames.add(normalizedName);
        }
      }
    });

    // Map Notion client IDs to colors based on name matching
    const notionIdToColorMap: Record<string, string> = {};
    const matchedClients: string[] = [];
    const unmatchedClients: string[] = [];

    notionClients.forEach(client => {
      const normalizedClientName = client.name.toLowerCase().trim();
      const color = nameToColorMap.get(normalizedClientName);
      
      if (color) {
        notionIdToColorMap[client.id] = color;
        matchedClients.push(`✅ ${client.name}: ${color}`);
      } else {
        unmatchedClients.push(`❌ ${client.name}: No color found in JSON`);
      }
    });

    console.log('\n📋 Mapping results:\n');
    console.log('Matched clients:');
    matchedClients.forEach(msg => console.log(`  ${msg}`));
    
    if (unmatchedClients.length > 0) {
      console.log('\nUnmatched clients (will keep existing or use default colors):');
      unmatchedClients.forEach(msg => console.log(`  ${msg}`));
    }

    console.log(`\n📊 Summary:`);
    console.log(`  - Total Notion clients: ${notionClients.length}`);
    console.log(`  - Matched with colors: ${matchedClients.length}`);
    console.log(`  - Unmatched: ${unmatchedClients.length}`);

    // Save the mapped colors to database
    await ConfigModel.setValue('CLIENT_COLORS', notionIdToColorMap);
    logger.info('Client colors saved to database successfully');

    // Verify the save
    const savedColors = await ConfigModel.getValue('CLIENT_COLORS');
    const savedCount = Object.keys(savedColors || {}).length;
    logger.info(`Verification: ${savedCount} colors saved in database`);

    console.log(`\n✅ Successfully imported ${matchedClients.length} client colors!`);
    console.log('🎨 Colors are now mapped to current Notion client IDs');

  } catch (error) {
    logger.error('Failed to import client colors', { error });
    console.error('❌ Import failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from database');
  }
}

// Run the import
importClientColors();