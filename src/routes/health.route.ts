import { Router } from 'express';
import { HealthController } from '../controllers/health.controller';

const router = Router();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the current health status of the backend service
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 message:
 *                   type: string
 *                   example: Matter Traffic Backend is operational
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 systemInfo:
 *                   type: object
 *                   properties:
 *                     uptime:
 *                       type: string
 *                       example: 3600s
 *                     memory:
 *                       type: object
 *                       properties:
 *                         used:
 *                           type: string
 *                           example: 128MB
 *                         total:
 *                           type: string
 *                           example: 8192MB
 *                     nodeVersion:
 *                       type: string
 *                       example: v20.0.0
 *                 database:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: connected
 *                     connected:
 *                       type: boolean
 *                       example: true
 *       500:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Internal server error
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/', HealthController.getHealth);

export default router;