import { Router } from 'express';
import clientsRouter from './clients.route';
import membersRouter from './members.route';
import projectsRouter from './projects.route';
import teamsRouter from './teams.route';

const router = Router();

/**
 * Entity Routes
 * Base path: /api/v1
 */

// Clients routes
router.use('/clients', clientsRouter);

// Members routes
router.use('/members', membersRouter);

// Projects routes
router.use('/projects', projectsRouter);

// Teams routes
router.use('/teams', teamsRouter);

export default router;
