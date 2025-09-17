import { Request, Response, NextFunction } from 'express';
import NotionConfigModel from '../models/NotionConfig.model';
import NotionDiscoveryService from '../services/NotionDiscoveryService';

/**
 * Run full discovery process for all databases
 */
export const runFullDiscovery = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const environment = process.env.NODE_ENV || 'development';
    const config = await NotionConfigModel.findOne({ environment }).select('+integrationToken');
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Notion configuration not found'
      });
      return;
    }
    
    // Decrypt token or use environment variable as fallback
    let decryptedToken: string;
    try {
      if (config.integrationToken) {
        decryptedToken = (config as any).decryptToken(config.integrationToken);
      } else if (process.env.NOTION_TOKEN) {
        decryptedToken = process.env.NOTION_TOKEN;
        console.log('Using NOTION_TOKEN from environment variable as fallback');
      } else {
        res.status(400).json({
          success: false,
          error: 'Notion token not configured'
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
    
    // Initialize discovery service
    const discoveryService = new NotionDiscoveryService(decryptedToken, config);
    
    // Run full discovery
    const result = await discoveryService.runFullDiscovery();
    
    res.status(200).json({
      success: true,
      message: 'Discovery process completed successfully',
      data: {
        schemas: result.schemas,
        validation: result.validation,
        documentation: result.documentation,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Error in runFullDiscovery:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run discovery process',
      details: error.message || 'Unknown error'
    });
  }
};

/**
 * Validate relationships between databases
 */
export const validateRelationships = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const environment = process.env.NODE_ENV || 'development';
    const config = await NotionConfigModel.findOne({ environment }).select('+integrationToken');
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Notion configuration not found'
      });
      return;
    }
    
    // Decrypt token
    let decryptedToken: string;
    try {
      if (config.integrationToken) {
        decryptedToken = (config as any).decryptToken(config.integrationToken);
      } else if (process.env.NOTION_TOKEN) {
        decryptedToken = process.env.NOTION_TOKEN;
      } else {
        res.status(400).json({
          success: false,
          error: 'Notion token not configured'
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
    
    // Initialize discovery service
    const discoveryService = new NotionDiscoveryService(decryptedToken, config);
    
    // Validate relationships
    const result = await discoveryService.validateRelationships();
    
    res.status(200).json({
      success: true,
      message: 'Relationship validation completed',
      data: result
    });
  } catch (error: any) {
    console.error('Error in validateRelationships:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate relationships',
      details: error.message || 'Unknown error'
    });
  }
};

/**
 * Get discovered schemas for all databases
 */
export const getDiscoveredSchemas = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const environment = process.env.NODE_ENV || 'development';
    const config = await NotionConfigModel.findOne({ environment }).select('+integrationToken');
    
    if (!config) {
      res.status(404).json({
        success: false,
        error: 'Notion configuration not found'
      });
      return;
    }
    
    // Decrypt token
    let decryptedToken: string;
    try {
      if (config.integrationToken) {
        decryptedToken = (config as any).decryptToken(config.integrationToken);
      } else if (process.env.NOTION_TOKEN) {
        decryptedToken = process.env.NOTION_TOKEN;
      } else {
        res.status(400).json({
          success: false,
          error: 'Notion token not configured'
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
    
    // Initialize discovery service
    const discoveryService = new NotionDiscoveryService(decryptedToken, config);
    
    // Discover all schemas
    const schemas = await discoveryService.discoverAllDatabases();
    
    res.status(200).json({
      success: true,
      message: 'Schemas discovered successfully',
      data: {
        schemas,
        databaseCount: Object.keys(schemas).length,
        totalProperties: Object.values(schemas).reduce(
          (sum, schema) => sum + Object.keys(schema.properties).length,
          0
        )
      }
    });
  } catch (error: any) {
    console.error('Error in getDiscoveredSchemas:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover schemas',
      details: error.message || 'Unknown error'
    });
  }
};