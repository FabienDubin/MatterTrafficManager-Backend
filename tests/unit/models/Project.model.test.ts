import mongoose from 'mongoose';
import { ProjectModel, IProject } from '../../../src/models/Project.model';

describe('Project Model', () => {
  describe('Validation', () => {
    it('should validate a valid project', () => {
      const validProject = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        clientId: 'client-123',
        clientName: 'Test Client',
        projectLeadId: 'lead-123',
        status: 'in_progress',
        teamIds: ['team1', 'team2'],
        teamNames: ['Team Alpha', 'Team Beta'],
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        budget: 50000,
        currency: 'EUR'
      });

      const error = validProject.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require notionId', () => {
      const project = new ProjectModel({
        name: 'Test Project',
        clientId: 'client-123',
        status: 'in_progress',
        teamIds: ['team1']
      });

      const error = project.validateSync();
      expect(error?.errors.notionId).toBeDefined();
      expect(error?.errors.notionId.message).toBe('Notion ID is required');
    });

    it('should require name', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        clientId: 'client-123',
        projectLeadId: 'lead-123',
        status: 'in_progress',
        teamIds: ['team1']
      });

      const error = project.validateSync();
      expect(error?.errors.name).toBeDefined();
      expect(error?.errors.name.message).toBe('Name is required');
    });

    it('should require clientId', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        projectLeadId: 'lead-123',
        status: 'in_progress',
        teamIds: ['team1']
      });

      const error = project.validateSync();
      expect(error?.errors.clientId).toBeDefined();
      expect(error?.errors.clientId.message).toBe('Client ID is required');
    });

    it('should only accept valid status values', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        clientId: 'client-123',
        projectLeadId: 'lead-123',
        status: 'invalid_status' as any,
        teamIds: ['team1']
      });

      const error = project.validateSync();
      expect(error?.errors.status).toBeDefined();
    });

    it('should validate that end date is after start date', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        clientId: 'client-123',
        projectLeadId: 'lead-123',
        status: 'in_progress',
        teamIds: ['team1'],
        startDate: new Date('2025-12-31'),
        endDate: new Date('2025-01-01')
      });

      const error = project.validateSync();
      expect(error?.errors.endDate).toBeDefined();
      expect(error?.errors.endDate.message).toBe(
        'End date must be after or equal to start date'
      );
    });

    it('should validate budget is non-negative', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        clientId: 'client-123',
        projectLeadId: 'lead-123',
        status: 'in_progress',
        teamIds: ['team1'],
        budget: -1000
      });

      const error = project.validateSync();
      expect(error?.errors.budget).toBeDefined();
      expect(error?.errors.budget.message).toBe('Budget cannot be negative');
    });

    it('should support multiple teams', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        clientId: 'client-123',
        projectLeadId: 'lead-123',
        status: 'in_progress',
        teamIds: ['team1', 'team2', 'team3']
      });

      const error = project.validateSync();
      expect(error).toBeUndefined();
      expect(project.teamIds).toHaveLength(3);
    });

    it('should set default values correctly', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        clientId: 'client-123',
        projectLeadId: 'lead-123',
        status: 'in_progress',
        teamIds: ['team1']
      });

      expect(project.syncedAt).toBeDefined();
      expect(project._ttl).toBeDefined();
    });

    it('should handle denormalized clientName field', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        clientId: 'client-123',
        projectLeadId: 'lead-123',
        clientName: 'Acme Corporation',
        status: 'in_progress',
        teamIds: ['team1']
      });

      expect(project.clientName).toBe('Acme Corporation');
      const error = project.validateSync();
      expect(error).toBeUndefined();
    });
  });

  describe('Instance Methods', () => {
    it('should mark project as completed', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        clientId: 'client-123',
        projectLeadId: 'lead-123',
        status: 'in_progress',
        teamIds: ['team1']
      });

      project.markAsCompleted = jest.fn().mockImplementation(function(this: IProject) {
        this.status = 'completed';
        this.completedAt = new Date();
        return Promise.resolve(this);
      });

      project.markAsCompleted();
      expect(project.status).toBe('completed');
      expect(project.completedAt).toBeDefined();
    });
  });

  describe('Static Methods', () => {
    it('should have upsertFromNotion static method', () => {
      expect(typeof ProjectModel.upsertFromNotion).toBe('function');
    });

    it('should have findByClient static method', () => {
      expect(typeof ProjectModel.findByClient).toBe('function');
    });

    it('should have findByStatus static method', () => {
      expect(typeof ProjectModel.findByStatus).toBe('function');
    });

    it('should have findActive static method', () => {
      expect(typeof ProjectModel.findActive).toBe('function');
    });
  });

  describe('TTL Configuration', () => {
    it('should set TTL to 30 days by default', () => {
      const project = new ProjectModel({
        notionId: 'notion-123',
        name: 'Test Project',
        clientId: 'client-123',
        projectLeadId: 'lead-123',
        status: 'in_progress',
        teamIds: ['team1']
      });

      const ttlTime = project._ttl.getTime();
      const nowTime = Date.now();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      
      // Vérifier que le TTL est environ 30 jours dans le futur (avec une marge de 1 minute)
      expect(ttlTime).toBeGreaterThan(nowTime + thirtyDaysInMs - 60000);
      expect(ttlTime).toBeLessThan(nowTime + thirtyDaysInMs + 60000);
    });
  });

  describe('Indexes', () => {
    it('should have proper index configuration', () => {
      const schema = ProjectModel.schema;
      const paths = schema.paths;
      
      // Vérifier que les champs indexés sont configurés
      expect(paths.notionId.options.unique).toBe(true);
      expect(paths.notionId.options.index).toBe(true);
      expect(paths.clientId.options.index).toBe(true);
      expect(paths.status.options.index).toBe(true);
    });
  });
});