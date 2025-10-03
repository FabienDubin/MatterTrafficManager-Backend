import { Request, Response, NextFunction } from 'express';
import { entityService } from '../../services/notion/entity.service';
import logger from '../../config/logger.config';
import { NotionTeam } from '../../types/notion.types';

/**
 * Controller for teams operations
 */
class TeamsController {
  /**
   * Get all teams from Notion
   * GET /api/v1/teams
   */
  async getAllTeams(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('Fetching all teams from Notion');

      const teams = await entityService.getAllTeams();

      logger.info(`Successfully retrieved ${teams.length} teams`);

      res.json({
        success: true,
        data: teams.map((team: NotionTeam) => ({
          id: team.id,
          name: team.name,
        })),
        count: teams.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to fetch teams', { error });
      next(error);
    }
  }
}

export default new TeamsController();
