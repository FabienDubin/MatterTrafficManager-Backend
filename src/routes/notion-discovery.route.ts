import { Router } from 'express';
import {
  runFullDiscovery,
  validateRelationships,
  getDiscoveredSchemas
} from '../controllers/notion-discovery.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';

const router = Router();

/**
 * @route   POST /api/v1/admin/notion-discovery/full
 * @desc    Run full discovery process for all databases
 * @access  Admin only
 */
router.post(
  '/full',
  authenticate,
  requireAdmin,
  runFullDiscovery
);

/**
 * @route   POST /api/v1/admin/notion-discovery/validate-relationships
 * @desc    Validate relationships between databases
 * @access  Admin only
 */
router.post(
  '/validate-relationships',
  authenticate,
  requireAdmin,
  validateRelationships
);

/**
 * @route   GET /api/v1/admin/notion-discovery/schemas
 * @desc    Get discovered schemas for all databases
 * @access  Admin only
 */
router.get(
  '/schemas',
  authenticate,
  requireAdmin,
  getDiscoveredSchemas
);

export default router;