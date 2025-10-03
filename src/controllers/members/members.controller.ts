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
   * Query params:
   * - teams: comma-separated list of team IDs to filter by (e.g., ?teams=team1,team2)
   */
  async getAllMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const { teams } = req.query;

      logger.info('Fetching all members from Notion', { teamsFilter: teams });

      const members = await entityService.getAllMembers();

      // Filter members by teams if query param is provided
      let filteredMembers = members;
      if (teams && typeof teams === 'string') {
        const teamIds = teams.split(',').map(id => id.trim()).filter(Boolean);

        if (teamIds.length > 0) {
          filteredMembers = members.filter((member: NotionMember) => {
            const memberTeams = member.teams || [];
            // Return members that have at least one team in the filter list
            return memberTeams.some(memberTeam => teamIds.includes(memberTeam));
          });

          logger.info(`Filtered members by teams ${teamIds.join(', ')}: ${filteredMembers.length}/${members.length} members match`);
        }
      }

      logger.info(`Successfully retrieved ${filteredMembers.length} members`);

      res.json({
        success: true,
        data: filteredMembers.map((member: NotionMember) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          teams: member.teams || [],
        })),
        count: filteredMembers.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to fetch members', { error });
      next(error);
    }
  }
}

export default new MembersController();
