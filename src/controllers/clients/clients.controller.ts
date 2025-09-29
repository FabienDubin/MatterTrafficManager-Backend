import { Request, Response, NextFunction } from 'express';
import { entityService } from '../../services/notion/entity.service';
import logger from '../../config/logger.config';
import { ConfigModel } from '../../models/Config.model';
import { NotionClient } from '../../types/notion.types';

class ClientsController {
  /**
   * Get all clients from Notion
   */
  async getAllClients(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('Fetching all clients from Notion');
      
      const clients = await entityService.getAllClients();
      
      logger.info(`Successfully retrieved ${clients.length} clients`);
      
      res.json({
        success: true,
        data: clients.map((client: NotionClient) => ({
          id: client.id,
          name: client.name,
        })),
        count: clients.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to fetch clients', { error });
      next(error);
    }
  }

  /**
   * Get client colors configuration
   */
  async getClientColors(_req: Request, res: Response, next: NextFunction) {
    try {
      const colors = await ConfigModel.getValue('CLIENT_COLORS');
      
      res.json({
        success: true,
        data: colors || {},
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to fetch client colors', { error });
      next(error);
    }
  }

  /**
   * Update client colors configuration
   */
  async updateClientColors(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { colors } = req.body;
      const userId = (req as any).user?.id;
      
      if (!colors || typeof colors !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid colors object'
        });
      }
      
      await ConfigModel.setValue('CLIENT_COLORS', colors, userId);
      
      logger.info('Client colors updated', { userId, colorsCount: Object.keys(colors).length });
      
      return res.json({
        success: true,
        message: 'Client colors updated successfully',
        data: colors,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to update client colors', { error });
      next(error);
    }
  }
}

export default new ClientsController();