import { Request, Response, NextFunction } from 'express';
import { Client } from '@notionhq/client';
import NotionConfigModel, { INotionConfig } from '../models/NotionConfig.model';
import mongoose from 'mongoose';

/**
 * Get current Notion configuration
 */
export const getNotionConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const environment = process.env.NODE_ENV || 'development';
    
    let config = await NotionConfigModel.findOne({ environment })
      .select('+notionToken');
    
    if (!config) {
      // Create default configuration if none exists
      const userId = (req as any).user?._id || new mongoose.Types.ObjectId();
      
      // Use environment variable as fallback for token
      const defaultToken = process.env.NOTION_TOKEN || '';
      let encryptedToken = '';
      
      if (defaultToken) {
        const tempConfig = new NotionConfigModel();
        encryptedToken = (tempConfig as any).encryptToken(defaultToken);
      }
      
      config = await NotionConfigModel.create({
        environment,
        notionToken: encryptedToken,
        databases: {
          teams: { id: '268a12bfa99281f886bbd9ffc36be65f', name: 'Teams' },
          users: { id: '268a12bfa99281bf9101ebacbae3e39a', name: 'Users' },
          clients: { id: '268a12bfa99281fb8566e7917a7f8b8e', name: 'Clients' },
          projects: { id: '268a12bfa9928105a95fde79cea0f6ff', name: 'Projects' },
          traffic: { id: '268a12bfa99281809af5f6a9d2fccbe3', name: 'Traffic' }
        },
        mappings: [],
        relationships: [],
        autoDetectEnabled: true,
        createdBy: userId,
        updatedBy: userId
      });
    }
    
    // Decrypt token before sending
    if (config.notionToken) {
      try {
        const decryptedToken = (config as any).decryptToken(config.notionToken);
        config.notionToken = decryptedToken;
      } catch (error) {
        console.error('Error decrypting token:', error);
        config.notionToken = '';
      }
    }
    
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting Notion config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Notion configuration'
    });
  }
};

/**
 * Save/Update Notion configuration
 */
export const saveNotionConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const environment = process.env.NODE_ENV || 'development';
    const userId = (req as any).user?._id || new mongoose.Types.ObjectId();
    const ipAddress = req.ip;
    
    const { notionToken, databases } = req.body;
    
    // At least one field must be provided
    if (!notionToken && !databases) {
      res.status(400).json({
        success: false,
        error: 'At least notionToken or databases must be provided'
      });
      return;
    }
    
    // If databases are provided, validate them
    if (databases) {
      const uuidRegex = /^[0-9a-f]{32}$/i;
      const databaseNames = ['teams', 'users', 'clients', 'projects', 'traffic'];
      
      for (const dbName of databaseNames) {
        if (!databases[dbName]?.id || !uuidRegex.test(databases[dbName].id)) {
          res.status(400).json({
            success: false,
            error: `Invalid database ID format for ${dbName}`
          });
          return;
        }
      }
    }
    
    let config = await NotionConfigModel.findOne({ environment });
    
    if (config) {
      // Track changes for audit log
      const changes: Record<string, any> = {};
      
      // Update token if provided
      if (notionToken) {
        const encryptedToken = (config as any).encryptToken(notionToken);
        if (config.notionToken !== encryptedToken) {
          changes.notionToken = 'Updated';
          config.notionToken = encryptedToken;
        }
      }
      
      // Update databases if provided
      if (databases) {
        const databaseNames = ['teams', 'users', 'clients', 'projects', 'traffic'];
        for (const dbName of databaseNames) {
          const currentDb = (config.databases as any)[dbName];
          const newDb = (databases as any)[dbName];
          if (currentDb.id !== newDb.id) {
            changes[`databases.${dbName}.id`] = {
              old: currentDb.id,
              new: newDb.id
            };
          }
        }
        config.databases = databases;
      }
      
      config.updatedBy = userId;
      
      // Add audit log entry
      (config as any).addAuditEntry(userId, 'UPDATE_CONFIG', changes, ipAddress);
      
      await config.save();
    } else {
      // Create new configuration - need at least default databases
      const defaultDatabases = databases || {
        teams: { id: '268a12bfa99281f886bbd9ffc36be65f', name: 'Teams' },
        users: { id: '268a12bfa99281bf9101ebacbae3e39a', name: 'Users' },
        clients: { id: '268a12bfa99281fb8566e7917a7f8b8e', name: 'Clients' },
        projects: { id: '268a12bfa9928105a95fde79cea0f6ff', name: 'Projects' },
        traffic: { id: '268a12bfa99281809af5f6a9d2fccbe3', name: 'Traffic' }
      };
      
      const newConfig = new NotionConfigModel({
        environment,
        notionToken: '',
        databases: defaultDatabases,
        createdBy: userId,
        updatedBy: userId,
        mappings: [],
        relationships: [],
        autoDetectEnabled: true
      });
      
      // Encrypt token if provided
      if (notionToken) {
        const encryptedToken = (newConfig as any).encryptToken(notionToken);
        newConfig.notionToken = encryptedToken;
      }
      
      // Add audit log entry
      (newConfig as any).addAuditEntry(userId, 'CREATE_CONFIG', { action: 'Initial configuration' }, ipAddress);
      
      config = await newConfig.save();
    }
    
    res.status(200).json({
      success: true,
      message: 'Configuration saved successfully',
      data: {
        environment: config.environment,
        databases: config.databases,
        version: config.version
      }
    });
  } catch (error) {
    console.error('Error saving Notion config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save Notion configuration'
    });
  }
};

/**
 * Test connection to a specific Notion database
 */
export const testNotionConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { databaseName } = req.body;
    
    if (!databaseName) {
      res.status(400).json({
        success: false,
        error: 'Database name is required'
      });
      return;
    }
    
    const validDatabases = ['teams', 'users', 'clients', 'projects', 'traffic'];
    if (!validDatabases.includes(databaseName)) {
      res.status(400).json({
        success: false,
        error: `Invalid database name. Must be one of: ${validDatabases.join(', ')}`
      });
      return;
    }
    
    const environment = process.env.NODE_ENV || 'development';
    const config = await NotionConfigModel.findOne({ environment }).select('+notionToken');
    
    if (!config) {
      res.status(400).json({
        success: false,
        error: 'Notion configuration not found'
      });
      return;
    }
    
    // Decrypt token or use environment variable as fallback
    let decryptedToken: string;
    try {
      if (config.notionToken) {
        decryptedToken = (config as any).decryptToken(config.notionToken);
      } else if (process.env.NOTION_TOKEN) {
        decryptedToken = process.env.NOTION_TOKEN;
        console.log('Using NOTION_TOKEN from environment variable as fallback');
      } else {
        res.status(400).json({
          success: false,
          error: 'Notion token not configured. Please set token in configuration or NOTION_TOKEN environment variable.'
        });
        return;
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to decrypt Notion token'
      });
      return;
    }
    
    // Initialize Notion client
    const notion = new Client({
      auth: decryptedToken
    });
    
    const databaseId = config.databases[databaseName as keyof typeof config.databases].id;
    
    try {
      // Test connection with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 30000)
      );
      
      const queryPromise = notion.databases.query({
        database_id: databaseId,
        page_size: 1
      });
      
      const response = await Promise.race([queryPromise, timeoutPromise]) as any;
      
      // Update test status in config
      const dbKey = databaseName as keyof typeof config.databases;
      config.databases[dbKey].lastTestDate = new Date();
      config.databases[dbKey].lastTestStatus = 'success';
      config.databases[dbKey].lastTestMessage = `Successfully connected. Found ${response.results.length} entries.`;
      config.databases[dbKey].entryCount = response.results.length;
      
      await config.save();
      
      res.status(200).json({
        success: true,
        message: `Successfully connected to ${databaseName} database`,
        data: {
          databaseName,
          databaseId,
          entryCount: response.results.length,
          hasMore: response.has_more,
          firstEntry: response.results[0] || null
        }
      });
    } catch (error: any) {
      // Update test status with error
      const dbKey = databaseName as keyof typeof config.databases;
      config.databases[dbKey].lastTestDate = new Date();
      config.databases[dbKey].lastTestStatus = 'error';
      config.databases[dbKey].lastTestMessage = error.message || 'Connection failed';
      
      await config.save();
      
      console.error(`Error testing Notion connection for ${databaseName}:`, error);
      
      res.status(400).json({
        success: false,
        error: `Failed to connect to ${databaseName} database`,
        details: error.message || 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Error in testNotionConnection:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while testing connection'
    });
  }
};