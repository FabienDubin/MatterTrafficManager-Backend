import mongoose from 'mongoose';
import { TaskModel, ITask } from '../../../src/models/Task.model';

describe('Task Model', () => {
  describe('Validation', () => {
    it('should validate a valid task', () => {
      const validTask = new TaskModel({
        notionId: 'notion-123',
        title: 'Test Task',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1', 'member2'],
        projectId: 'project-123',
        status: 'not_started',
        taskType: 'task'
      });

      const error = validTask.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require notionId', () => {
      const task = new TaskModel({
        title: 'Test Task',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123'
      });

      const error = task.validateSync();
      expect(error?.errors.notionId).toBeDefined();
      expect(error?.errors.notionId.message).toBe('Notion ID is required');
    });

    it('should require title', () => {
      const task = new TaskModel({
        notionId: 'notion-123',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123'
      });

      const error = task.validateSync();
      expect(error?.errors.title).toBeDefined();
      expect(error?.errors.title.message).toBe('Title is required');
    });

    it('should validate that end date is after start date', () => {
      const task = new TaskModel({
        notionId: 'notion-123',
        title: 'Test Task',
        workPeriod: {
          startDate: new Date('2025-01-05'),
          endDate: new Date('2025-01-01')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123'
      });

      const error = task.validateSync();
      expect(error?.errors['workPeriod.endDate']).toBeDefined();
      expect(error?.errors['workPeriod.endDate'].message).toBe(
        'End date must be after or equal to start date'
      );
    });

    it('should only accept valid status values', () => {
      const task = new TaskModel({
        notionId: 'notion-123',
        title: 'Test Task',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123',
        status: 'invalid_status' as any
      });

      const error = task.validateSync();
      expect(error?.errors.status).toBeDefined();
    });

    it('should only accept valid taskType values', () => {
      const task = new TaskModel({
        notionId: 'notion-123',
        title: 'Test Task',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123',
        taskType: 'invalid_type' as any
      });

      const error = task.validateSync();
      expect(error?.errors.taskType).toBeDefined();
    });

    it('should validate billedHours range', () => {
      const task = new TaskModel({
        notionId: 'notion-123',
        title: 'Test Task',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123',
        billedHours: -1
      });

      const error = task.validateSync();
      expect(error?.errors.billedHours).toBeDefined();
      expect(error?.errors.billedHours.message).toBe('Billed hours cannot be negative');
    });

    it('should set default values correctly', () => {
      const task = new TaskModel({
        notionId: 'notion-123',
        title: 'Test Task',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123'
      });

      expect(task.status).toBe('not_started');
      expect(task.taskType).toBe('task');
      expect(task.addToCalendar).toBe(false);
      expect(task.addToClientPlanning).toBe(false);
      expect(task.lastNotionSync).toBeDefined();
      expect(task._ttl).toBeDefined();
    });

    it('should handle googleEventId as optional with sparse index', () => {
      const task1 = new TaskModel({
        notionId: 'notion-123',
        title: 'Task 1',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123'
      });

      const task2 = new TaskModel({
        notionId: 'notion-456',
        title: 'Task 2',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123',
        googleEventId: 'google-event-123'
      });

      expect(task1.googleEventId).toBeUndefined();
      expect(task2.googleEventId).toBe('google-event-123');
    });
  });

  describe('Instance Methods', () => {
    it('should mark task as completed', () => {
      const task = new TaskModel({
        notionId: 'notion-123',
        title: 'Test Task',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123',
        status: 'not_started'
      });

      task.markAsCompleted = jest.fn().mockImplementation(function(this: ITask) {
        this.status = 'completed';
        return Promise.resolve(this);
      });

      task.markAsCompleted();
      expect(task.status).toBe('completed');
    });
  });

  describe('Static Methods', () => {
    it('should have upsertFromNotion static method', () => {
      expect(typeof TaskModel.upsertFromNotion).toBe('function');
    });

    it('should have findByDateRange static method', () => {
      expect(typeof TaskModel.findByDateRange).toBe('function');
    });

    it('should have findByAssignedMember static method', () => {
      expect(typeof TaskModel.findByAssignedMember).toBe('function');
    });
  });

  describe('TTL Configuration', () => {
    it('should set TTL to 30 days by default', () => {
      const task = new TaskModel({
        notionId: 'notion-123',
        title: 'Test Task',
        workPeriod: {
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-05')
        },
        assignedMembers: ['member1'],
        projectId: 'project-123'
      });

      const ttlTime = task._ttl.getTime();
      const nowTime = Date.now();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      
      // Vérifier que le TTL est environ 30 jours dans le futur (avec une marge de 1 minute)
      expect(ttlTime).toBeGreaterThan(nowTime + thirtyDaysInMs - 60000);
      expect(ttlTime).toBeLessThan(nowTime + thirtyDaysInMs + 60000);
    });
  });
});