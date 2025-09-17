import { Router } from 'express';
import monitoringController from '../controllers/monitoring.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

/**
 * @route   GET /api/v1/monitoring/health
 * @desc    Get overall system health
 * @access  Public (for monitoring tools)
 */
router.get('/health', monitoringController.getSystemHealth);

/**
 * @route   GET /api/v1/monitoring/sync/stats
 * @desc    Get detailed sync statistics
 * @access  Admin
 */
router.get('/sync/stats', authenticate, requireAdmin, monitoringController.getSyncStatistics);

/**
 * @route   GET /api/v1/monitoring/cache/stats
 * @desc    Get cache statistics
 * @access  Admin
 */
router.get('/cache/stats', authenticate, requireAdmin, monitoringController.getCacheStatistics);

/**
 * @route   GET /api/v1/monitoring/jobs/status
 * @desc    Get job statuses
 * @access  Admin
 */
router.get('/jobs/status', authenticate, requireAdmin, monitoringController.getJobStatuses);

/**
 * @route   GET /api/v1/monitoring/circuit-breakers
 * @desc    Get circuit breaker status
 * @access  Admin
 */
router.get('/circuit-breakers', authenticate, requireAdmin, monitoringController.getCircuitBreakerStatus);

/**
 * @route   POST /api/v1/monitoring/reconciliation/trigger
 * @desc    Trigger manual reconciliation
 * @access  Admin
 */
router.post('/reconciliation/trigger', authenticate, requireAdmin, monitoringController.triggerReconciliation);

export default router;