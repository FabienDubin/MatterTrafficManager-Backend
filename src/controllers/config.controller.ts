import { Request, Response } from 'express';
import { ConfigModel } from '../models/Config.model';
import logger from '../config/logger.config';

export class ConfigController {
  /**
   * Get all configs or by category
   * GET /api/config?category=sync
   */
  async getConfigs(req: Request, res: Response) {
    try {
      const { category } = req.query;
      
      let configs;
      if (category) {
        configs = await ConfigModel.getByCategory(category as string);
      } else {
        configs = await ConfigModel.find({ isEditable: true });
      }
      
      // Transform to key-value object for easier frontend use
      const configMap = configs.reduce((acc: Record<string, any>, config: any) => {
        acc[config.key] = {
          value: config.value,
          description: config.description,
          dataType: config.dataType,
          validValues: config.validValues,
          category: config.category
        };
        return acc;
      }, {} as Record<string, any>);
      
      return res.status(200).json({
        success: true,
        data: configMap,
        meta: {
          count: configs.length,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Error fetching configs:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch configurations'
      });
    }
  }
  
  /**
   * Get a single config value
   * GET /api/config/:key
   */
  async getConfig(req: Request, res: Response) {
    try {
      const { key } = req.params;
      
      const value = await ConfigModel.getValue(key as string);
      
      if (value === null) {
        return res.status(404).json({
          success: false,
          error: `Configuration ${key} not found`
        });
      }
      
      return res.status(200).json({
        success: true,
        data: {
          key,
          value
        }
      });
      
    } catch (error) {
      logger.error('Error fetching config:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch configuration'
      });
    }
  }
  
  /**
   * Update config values (admin only)
   * PUT /api/config
   */
  async updateConfigs(req: Request, res: Response) {
    try {
      const updates = req.body;
      const userId = (req as any).userId;
      
      const results = [];
      const errors = [];
      
      for (const [key, value] of Object.entries(updates)) {
        try {
          const config = await ConfigModel.findOne({ key });
          
          if (!config) {
            errors.push(`Config ${key} not found`);
            continue;
          }
          
          if (!config.isEditable) {
            errors.push(`Config ${key} is not editable`);
            continue;
          }
          
          // Update the config
          const updated = await ConfigModel.setValue(key, value, userId || undefined);
          if (updated) {
            results.push(updated);
            
            logger.info(`Config updated: ${key}`, {
              oldValue: config.value,
              newValue: value,
              updatedBy: userId
            });
          }
        } catch (err: any) {
          errors.push(`Failed to update ${key}: ${err.message}`);
        }
      }
      
      return res.status(200).json({
        success: errors.length === 0,
        data: {
          updated: results.length,
          errors: errors.length > 0 ? errors : undefined
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Error updating configs:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to update configurations'
      });
    }
  }
  
  /**
   * Initialize default configs (admin only)
   * POST /api/config/init
   */
  async initDefaults(req: Request, res: Response) {
    try {
      await ConfigModel.initDefaults();
      
      logger.info('Default configs initialized');
      
      return res.status(200).json({
        success: true,
        message: 'Default configurations initialized',
        meta: {
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Error initializing configs:', error);
      
      return res.status(500).json({
        success: false,
        error: 'Failed to initialize configurations'
      });
    }
  }
}

export default new ConfigController();