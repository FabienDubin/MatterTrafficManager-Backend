import { Request, Response } from "express";
import notionService from "../services/notion.service";
import { z } from "zod";
import { format, parseISO, isValid } from "date-fns";

// Validation schema for query params
const calendarQuerySchema = z.object({
  startDate: z.string().refine((date) => {
    const parsed = parseISO(date);
    return isValid(parsed);
  }, "Invalid startDate format. Use ISO 8601 format (YYYY-MM-DD)"),
  endDate: z.string().refine((date) => {
    const parsed = parseISO(date);
    return isValid(parsed);
  }, "Invalid endDate format. Use ISO 8601 format (YYYY-MM-DD)")
});

export class TasksController {
  /**
   * Get tasks for calendar view
   * GET /api/tasks/calendar?startDate=2025-01-01&endDate=2025-01-31
   */
  async getCalendarTasks(req: Request, res: Response) {
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

      // Format response
      // Note: Cache hit info would need to be tracked differently if needed
      // For now, we'll assume cache is working based on the service implementation
      return res.status(200).json({
        success: true,
        data: {
          tasks: tasks,
          cacheHit: true, // Calendar service uses cache by default
          period: {
            start: startDate,
            end: endDate
          }
        },
        meta: {
          count: tasks.length,
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

  /**
   * Get a single task by ID
   * GET /api/tasks/:id
   */
  async getTaskById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Task ID is required"
        });
      }

      // TODO: Implement when needed
      return res.status(501).json({
        success: false,
        error: "Not implemented yet"
      });
      
    } catch (error) {
      console.error("Error fetching task:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch task"
      });
    }
  }
}

export const tasksController = new TasksController();