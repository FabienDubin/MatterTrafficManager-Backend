import { Request, Response, NextFunction } from 'express';
import { entityService } from '../../services/notion/entity.service';
import logger from '../../config/logger.config';
import { NotionProject } from '../../types/notion.types';

/**
 * Controller for projects operations
 */
class ProjectsController {
  /**
   * Get all projects from Notion
   * GET /api/v1/projects
   */
  async getAllProjects(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('Fetching all projects from Notion');

      // Support optional status filter via query param
      const statusFilter = req.query.status as string | undefined;
      const filters = statusFilter ? { status: statusFilter } : undefined;

      const projects = await entityService.getAllProjects(filters);
      const clients = await entityService.getAllClients();

      logger.info(`Successfully retrieved ${projects.length} projects`);

      res.json({
        success: true,
        data: projects.map((project: NotionProject) => {
          const clientData = project.client
            ? clients.find(c => c.id === project.client)
            : null;

          return {
            id: project.id,
            name: project.name,
            status: project.status,
            client: project.client,
            clientName: clientData?.name || null,
          };
        }),
        count: projects.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to fetch projects', { error });
      next(error);
    }
  }

  /**
   * Get active projects (status = "En cours")
   * GET /api/v1/projects/active
   */
  async getActiveProjects(_req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('Fetching active projects from Notion');

      const projects = await entityService.getAllProjects({ status: 'En cours' });
      const clients = await entityService.getAllClients();

      logger.info(`Successfully retrieved ${projects.length} active projects`);

      res.json({
        success: true,
        data: projects.map((project: NotionProject) => {
          const clientData = project.client
            ? clients.find(c => c.id === project.client)
            : null;

          return {
            id: project.id,
            name: project.name,
            status: project.status,
            client: project.client,
            clientName: clientData?.name || null,
          };
        }),
        count: projects.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to fetch active projects', { error });
      next(error);
    }
  }
}

export default new ProjectsController();
