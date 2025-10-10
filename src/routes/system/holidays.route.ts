import { Router } from 'express';
import { holidaysController } from '../../controllers/holidays.controller';

const router = Router();

/**
 * Holidays routes
 * Base path: /api/v1
 */

// GET /api/v1/holidays/:year - Récupérer les jours fériés pour une année
router.get('/holidays/:year', holidaysController.getHolidays.bind(holidaysController));

export default router;