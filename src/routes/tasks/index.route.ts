import { Router } from "express";
import { tasksCrudRouter } from "./crud.route";
import { tasksCalendarRouter } from "./calendar.route";
import { tasksBatchRouter } from "./batch.route";
import { tasksStatsRouter } from "./stats.route";

const router = Router();

/**
 * Combined Tasks Routes
 * This router combines all task-related routes into a single export
 */

// Mount calendar routes at /calendar
router.use("/calendar", tasksCalendarRouter);

// Mount batch routes at /batch
router.use("/batch", tasksBatchRouter);

// Mount stats routes at /stats
router.use("/stats", tasksStatsRouter);

// Mount CRUD routes at root level (must be last due to /:id pattern)
router.use("/", tasksCrudRouter);

export { router as tasksRouter };