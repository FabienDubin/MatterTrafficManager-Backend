import { Request, Response } from "express";
import notionService from "../../services/notion.service";
import { parseISO } from "date-fns";
import { calendarQuerySchema } from "../../validators/tasks.validator";

/**
 * Controller for calendar-related task operations
 */
export class TasksCalendarController {
  /**
   * Get tasks for calendar view
   * GET /api/tasks/calendar?startDate=2025-01-01&endDate=2025-01-31
   */
  getCalendarTasks = async (req: Request, res: Response) => {
    try {
      // Validate query params
      const validation = calendarQuerySchema.safeParse(req.query);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: validation.error.errors
        });
      }

      const { startDate, endDate } = validation.data;
      
      // Check date range is valid
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      
      if (start > end) {
        return res.status(400).json({
          success: false,
          error: "startDate must be before endDate"
        });
      }

      // Get tasks from service (will handle cache/Notion)
      // Convert string dates to Date objects
      const startDateObj = parseISO(startDate);
      const endDateObj = parseISO(endDate);
      
      const tasks = await notionService.getTasksForCalendarView(
        startDateObj,
        endDateObj
      );

      // Enrichir les données avec le batch resolver
      const { resolvedTasks } = await notionService.batchResolveRelations({
        tasks
      });

      // Format response avec les données enrichies
      return res.status(200).json({
        success: true,
        data: {
          tasks: resolvedTasks,
          cacheHit: true, // Calendar service uses cache by default
          period: {
            start: startDate,
            end: endDate
          }
        },
        meta: {
          count: resolvedTasks.length,
          cached: true,
          timestamp: new Date().toISOString()
        }
      });
      
    } catch (error) {
      console.error("Error fetching calendar tasks:", error);
      
      // Check if it's a known error type
      if (error instanceof Error) {
        if (error.message.includes("rate limit")) {
          return res.status(429).json({
            success: false,
            error: "Rate limit exceeded. Please try again later."
          });
        }
        
        if (error.message.includes("notion")) {
          return res.status(503).json({
            success: false,
            error: "Notion service temporarily unavailable"
          });
        }
      }
      
      // Generic error response
      return res.status(500).json({
        success: false,
        error: "Failed to fetch calendar tasks"
      });
    }
  }
}

export const tasksCalendarController = new TasksCalendarController();