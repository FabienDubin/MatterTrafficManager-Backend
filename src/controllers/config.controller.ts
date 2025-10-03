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

  /**
   * Get teams display configuration with full team details from Notion
   * GET /api/v1/config/teams-display
   */
  async getTeamsDisplayConfig(req: Request, res: Response) {
    try {
      // Import entityService dynamically to avoid circular dependencies
      const { entityService } = await import('../services/notion/entity.service');

      // Get config from MongoDB
      const config = await ConfigModel.getValue('TEAMS_DISPLAY_CONFIG');

      if (!config) {
        logger.warn('TEAMS_DISPLAY_CONFIG not found, returning empty config');
        return res.status(200).json({
          success: true,
          data: {
            teams: []
          }
        });
      }

      // Support new format (teams array) and legacy format (selectedTeamIds)
      let teams = [];

      if (config.teams && Array.isArray(config.teams)) {
        // NEW FORMAT: teams array with embedded config
        if (config.teams.length === 0) {
          return res.status(200).json({
            success: true,
            data: { teams: [] }
          });
        }

        // Fetch all teams from Notion to enrich with names
        const allTeams = await entityService.getAllTeams();

        teams = config.teams
          .map((teamConfig: any) => {
            const notionTeam = allTeams.find((t: any) => t.id === teamConfig.id);
            return {
              id: teamConfig.id,
              name: notionTeam?.name || 'Unknown Team',
              icon: teamConfig.icon || 'Users',
              color: teamConfig.color || '#6B7280',
              order: teamConfig.order ?? 0
            };
          })
          .sort((a: any, b: any) => a.order - b.order);
      } else {
        // LEGACY FORMAT: selectedTeamIds + teamIcons + teamColors
        const { selectedTeamIds = [], teamIcons = {}, teamColors = {} } = config;

        if (selectedTeamIds.length === 0) {
          return res.status(200).json({
            success: true,
            data: { teams: [] }
          });
        }

        const allTeams = await entityService.getAllTeams();

        teams = allTeams
          .filter((team: any) => selectedTeamIds.includes(team.id))
          .map((team: any) => ({
            id: team.id,
            name: team.name,
            icon: teamIcons[team.id] || 'Users',
            color: teamColors[team.id] || '#6B7280',
            order: 0
          }));
      }

      logger.info(`Retrieved ${teams.length} teams for display config`);

      return res.status(200).json({
        success: true,
        data: {
          teams
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error fetching teams display config:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch teams display configuration'
      });
    }
  }

  /**
   * Update teams display configuration
   * PUT /api/v1/config/teams-display
   */
  async updateTeamsDisplayConfig(req: Request, res: Response) {
    try {
      const { teams } = req.body;

      // Validation
      if (!Array.isArray(teams)) {
        return res.status(400).json({
          success: false,
          error: 'Teams must be an array'
        });
      }

      // Max 4 teams
      if (teams.length > 4) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 4 teams allowed'
        });
      }

      // Validate each team config
      for (const team of teams) {
        if (!team.id || !team.icon || !team.color || typeof team.order !== 'number') {
          return res.status(400).json({
            success: false,
            error: 'Each team must have id, icon, color, and order fields'
          });
        }
      }

      // Update config
      const userId = (req as any).userId;
      await ConfigModel.setValue('TEAMS_DISPLAY_CONFIG', { teams }, userId);

      logger.info(`Updated teams display config with ${teams.length} teams by user ${userId || 'unknown'}`);

      return res.status(200).json({
        success: true,
        data: {
          teams
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error updating teams display config:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to update teams display configuration'
      });
    }
  }
}

export default new ConfigController();