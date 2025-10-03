import { Router } from 'express';
import notionRouter from './notion.route';
import notionConfigRouter from './notion-config.route';
import notionMappingRouter from './notion-mapping.route';
import notionDiscoveryRouter from './notion-discovery.route';

const router = Router();

/**
 * Notion Integration Routes
 * Base path: /api/v1
 */

// Main Notion API routes
router.use('/notion', notionRouter);

// Admin Notion configuration routes
router.use('/admin/notion-config', notionConfigRouter);
router.use('/admin/notion-mapping', notionMappingRouter);
router.use('/admin/notion-discovery', notionDiscoveryRouter);

export default router;
