import { Request, Response, NextFunction } from 'express';
import { entityService } from '../../services/notion/entity.service';
import logger from '../../config/logger.config';
import { NotionMember } from '../../types/notion.types';

/**
 * Controller for members operations
 */
class MembersController {
  /**
   * Get all members from Notion
   * GET /api/v1/members
   */
  async getAllMembers(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('Fetching all members from Notion');

      const members = await entityService.getAllMembers();

      logger.info(`Successfully retrieved ${members.length} members`);

      res.json({
        success: true,
        data: members.map((member: NotionMember) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          teams: member.teams || [],
        })),
        count: members.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to fetch members', { error });
      next(error);
    }
  }
}

export default new MembersController();
