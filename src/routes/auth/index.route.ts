import { Router } from 'express';
import authRouter from './auth.route';

const router = Router();

/**
 * Authentication Routes
 * Base path: /api/v1/auth
 */
router.use('/', authRouter);

export default router;
