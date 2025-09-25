import { z } from "zod";
import { parseISO, isValid } from "date-fns";

/**
 * Validation schema for calendar query params
 */
export const calendarQuerySchema = z.object({
  startDate: z.string().refine((date) => {
    const parsed = parseISO(date);
    return isValid(parsed);
  }, "Invalid startDate format. Use ISO 8601 format (YYYY-MM-DD)"),
  endDate: z.string().refine((date) => {
    const parsed = parseISO(date);
    return isValid(parsed);
  }, "Invalid endDate format. Use ISO 8601 format (YYYY-MM-DD)")
});

/**
 * Validation schema for creating a task
 */
export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  workPeriod: z.object({
    startDate: z.string().refine((date) => {
      const parsed = parseISO(date);
      return isValid(parsed);
    }, "Invalid startDate format"),
    endDate: z.string().refine((date) => {
      const parsed = parseISO(date);
      return isValid(parsed);
    }, "Invalid endDate format")
  }),
  assignedMembers: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  taskType: z.enum(['task', 'holiday', 'school', 'remote']).optional(),
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  notes: z.string().optional(),
  billedHours: z.number().optional(),
  actualHours: z.number().optional(),
  addToCalendar: z.boolean().optional(),
  clientPlanning: z.boolean().optional()
});

/**
 * Validation schema for updating a task
 */
export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  workPeriod: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional()
  }).optional(),
  assignedMembers: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  taskType: z.enum(['task', 'holiday', 'school', 'remote']).optional(),
  status: z.enum(['not_started', 'in_progress', 'completed']).optional(),
  notes: z.string().optional(),
  billedHours: z.number().optional(),
  actualHours: z.number().optional(),
  addToCalendar: z.boolean().optional(),
  clientPlanning: z.boolean().optional(),
  // Optimistic update fields
  expectedUpdatedAt: z.string().optional(), // ISO date de last_edited_time pour détecter conflits
  force: z.boolean().optional() // Force l'update même en cas de conflit
});

/**
 * Validation schema for batch updates
 */
export const batchUpdateSchema = z.object({
  updates: z.array(z.object({
    id: z.string(),
    data: updateTaskSchema
  }))
});

/**
 * Type exports for TypeScript
 */
export type CalendarQueryInput = z.infer<typeof calendarQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type BatchUpdateInput = z.infer<typeof batchUpdateSchema>;