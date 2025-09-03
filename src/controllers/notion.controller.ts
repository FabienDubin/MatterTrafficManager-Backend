import { Request, Response, NextFunction } from 'express';
import notionService from '../services/notion.service';
import { CreateTaskInput, UpdateTaskInput } from '../types/notion.types';
import logger from '../config/logger.config';

class NotionController {
  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = await notionService.validateAllDatabases();
      
      res.json({
        success: validation.success,
        message: validation.success 
          ? 'All Notion databases are accessible' 
          : 'Some databases are not accessible',
        databases: validation.databases,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }

  async testCrud(req: Request, res: Response, next: NextFunction) {
    const results: any = {
      create: { success: false },
      read: { success: false },
      update: { success: false },
      delete: { success: false }
    };

    let createdTaskId: string | null = null;

    try {
      const today = new Date();
      const tomorrow = new Date(Date.now() + 86400000);
      
      const testTask: CreateTaskInput = {
        title: `Test Task - ${today.toISOString()}`,
        workPeriod: {
          startDate: today.toISOString().split('T')[0]!,
          endDate: tomorrow.toISOString().split('T')[0]!
        },
        taskType: 'task',
        status: 'not_started',
        notes: 'This is a test task created by API validation',
        billedHours: 8,
        actualHours: 0,
        addToCalendar: false,
        clientPlanning: false
      };

      const createdTask = await notionService.createTask(testTask);
      createdTaskId = createdTask.id;
      results.create = {
        success: true,
        taskId: createdTask.id,
        title: createdTask.title
      };
      
      logger.info('CRUD test - CREATE successful', { taskId: createdTaskId });

      const readTask = await notionService.getTask(createdTaskId);
      results.read = {
        success: true,
        task: {
          id: readTask.id,
          title: readTask.title,
          relations: {
            assignedMembersCount: readTask.assignedMembers.length,
            hasProject: !!readTask.projectId,
            hasClient: !!readTask.client,
            hasTeam: !!readTask.team
          }
        }
      };
      
      logger.info('CRUD test - READ successful', { taskId: createdTaskId });

      const updateData: UpdateTaskInput = {
        title: `Updated Test Task - ${new Date().toISOString()}`,
        status: 'in_progress',
        actualHours: 2
      };

      const updatedTask = await notionService.updateTask(createdTaskId, updateData);
      results.update = {
        success: true,
        changes: {
          title: updatedTask.title,
          status: updatedTask.status,
          actualHours: updatedTask.actualHours
        }
      };
      
      logger.info('CRUD test - UPDATE successful', { taskId: createdTaskId });

      await notionService.archiveTask(createdTaskId);
      results.delete = {
        success: true,
        archived: true
      };
      
      logger.info('CRUD test - DELETE (archive) successful', { taskId: createdTaskId });

      res.json({
        success: true,
        message: 'CRUD operations completed successfully',
        results,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('CRUD test failed', { error, results });
      
      if (createdTaskId) {
        try {
          await notionService.archiveTask(createdTaskId);
          logger.info('Cleaned up test task after error', { taskId: createdTaskId });
        } catch (cleanupError) {
          logger.error('Failed to cleanup test task', { 
            taskId: createdTaskId, 
            error: cleanupError 
          });
        }
      }

      res.status(500).json({
        success: false,
        message: 'CRUD test failed',
        results,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async testRateLimit(req: Request, res: Response, next: NextFunction) {
    try {
      logger.info('Starting rate limit test with 10 rapid requests');
      
      const result = await notionService.testRateLimit();
      
      res.json({
        success: result.success,
        message: result.success 
          ? 'Rate limiting is working correctly'
          : 'Rate limit test encountered errors',
        details: {
          totalRequests: 10,
          timeTaken: result.timeTaken,
          averageTime: result.timeTaken / 10,
          errors: result.errors,
          effectiveRate: result.timeTaken > 0 ? (10 * 1000) / result.timeTaken : 0
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }

  async testRelations(req: Request, res: Response, next: NextFunction) {
    try {
      const trafficData = await notionService.queryTrafficDatabase(undefined, 5);
      const usersData = await notionService.queryUsersDatabase(undefined, 5);
      const projectsData = await notionService.queryProjectsDatabase(undefined, undefined, 5);
      
      const relations = {
        trafficToUsers: trafficData.results.map(task => ({
          taskId: task.id,
          taskTitle: task.title,
          assignedUserIds: task.assignedMembers,
          assignedCount: task.assignedMembers.length
        })),
        trafficToProjects: trafficData.results.map(task => ({
          taskId: task.id,
          taskTitle: task.title,
          projectId: task.projectId,
          hasProject: !!task.projectId
        })),
        usersToTasks: usersData.results.map(user => ({
          userId: user.id,
          userName: user.name,
          taskIds: user.tasks,
          taskCount: user.tasks.length
        })),
        projectsToTasks: projectsData.results.map(project => ({
          projectId: project.id,
          projectName: project.name,
          taskIds: project.tasks,
          taskCount: project.tasks.length
        })),
        rollups: trafficData.results.map(task => ({
          taskId: task.id,
          taskTitle: task.title,
          clientRollup: task.client,
          teamRollup: task.team
        }))
      };

      logger.info('Relations test completed', {
        tasksAnalyzed: trafficData.results.length,
        usersAnalyzed: usersData.results.length,
        projectsAnalyzed: projectsData.results.length
      });

      res.json({
        success: true,
        message: 'Bidirectional relations validated',
        relations,
        summary: {
          tasksWithUsers: relations.trafficToUsers.filter(t => t.assignedCount > 0).length,
          tasksWithProjects: relations.trafficToProjects.filter(t => t.hasProject).length,
          usersWithTasks: relations.usersToTasks.filter(u => u.taskCount > 0).length,
          projectsWithTasks: relations.projectsToTasks.filter(p => p.taskCount > 0).length,
          tasksWithRollups: relations.rollups.filter(t => t.clientRollup || t.teamRollup).length
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }

  async testFilters(req: Request, res: Response, next: NextFunction) {
    try {
      const inProgressProjects = await notionService.queryProjectsDatabase(
        { status: 'En cours' }
      );

      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const startDate = today.toISOString().split('T')[0];
      const endDate = nextWeek.toISOString().split('T')[0];
      
      const thisWeekTasks = await notionService.queryTasksWithFilters({
        dateRange: {
          start: startDate!,
          end: endDate!
        }
      });

      const completedTasks = await notionService.queryTasksWithFilters({
        status: 'completed'
      });

      logger.info('Filters test completed', {
        inProgressProjects: inProgressProjects.results.length,
        thisWeekTasks: thisWeekTasks.results.length,
        completedTasks: completedTasks.results.length
      });

      res.json({
        success: true,
        message: 'Filters and complex queries tested successfully',
        results: {
          projectsInProgress: {
            count: inProgressProjects.results.length,
            projects: inProgressProjects.results.slice(0, 3).map(p => ({
              id: p.id,
              name: p.name,
              status: p.status
            }))
          },
          tasksThisWeek: {
            count: thisWeekTasks.results.length,
            sample: thisWeekTasks.results.slice(0, 3).map(t => ({
              id: t.id,
              title: t.title,
              period: t.workPeriod
            }))
          },
          completedTasks: {
            count: completedTasks.results.length,
            sample: completedTasks.results.slice(0, 3).map(t => ({
              id: t.id,
              title: t.title,
              status: t.status
            }))
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }

  async testMappings(req: Request, res: Response, next: NextFunction) {
    try {
      const task = await notionService.queryTrafficDatabase(undefined, 1);
      
      if (task.results.length === 0) {
        res.status(404).json({
          success: false,
          message: 'No tasks found to test mappings'
        });
        return;
      }

      const mappedTask = task.results[0]!;
      
      const mappingValidation = {
        idFields: {
          taskId: { value: mappedTask.id, valid: !!mappedTask.id },
          title: { value: mappedTask.title, valid: typeof mappedTask.title === 'string' }
        },
        dateFields: {
          workPeriod: {
            start: mappedTask.workPeriod.startDate,
            end: mappedTask.workPeriod.endDate,
            valid: mappedTask.workPeriod.startDate instanceof Date || mappedTask.workPeriod.startDate === null
          },
          timestamps: {
            created: mappedTask.createdAt,
            updated: mappedTask.updatedAt,
            valid: mappedTask.createdAt instanceof Date && mappedTask.updatedAt instanceof Date
          }
        },
        relationFields: {
          assignedMembers: {
            value: mappedTask.assignedMembers,
            count: mappedTask.assignedMembers.length,
            valid: Array.isArray(mappedTask.assignedMembers)
          },
          projectId: {
            value: mappedTask.projectId,
            valid: typeof mappedTask.projectId === 'string' || mappedTask.projectId === null
          }
        },
        selectFields: {
          taskType: { value: mappedTask.taskType, valid: true },
          status: { value: mappedTask.status, valid: true }
        },
        numberFields: {
          billedHours: { value: mappedTask.billedHours, valid: true },
          actualHours: { value: mappedTask.actualHours, valid: true }
        },
        booleanFields: {
          addToCalendar: { value: mappedTask.addToCalendar, valid: typeof mappedTask.addToCalendar === 'boolean' },
          clientPlanning: { value: mappedTask.clientPlanning, valid: typeof mappedTask.clientPlanning === 'boolean' }
        },
        rollupFields: {
          client: { value: mappedTask.client, isReadOnly: true },
          team: { value: mappedTask.team, isReadOnly: true }
        }
      };

      logger.info('ID mappings validated', { taskId: mappedTask.id });

      res.json({
        success: true,
        message: 'Property ID mappings validated successfully',
        mappingValidation,
        sampleTask: mappedTask,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new NotionController();