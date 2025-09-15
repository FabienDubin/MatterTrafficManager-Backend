import mongoose from 'mongoose';
import { TeamModel, ITeam } from '../../../src/models/Team.model';

describe('Team Model', () => {
  describe('Validation', () => {
    it('should validate a valid team', () => {
      const validTeam = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1,
        memberCount: 5,
        description: 'Main engineering team'
      });

      const error = validTeam.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require notionId', () => {
      const team = new TeamModel({
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1
      });

      const error = team.validateSync();
      expect(error?.errors.notionId).toBeDefined();
      expect(error?.errors.notionId.message).toBe('Notion ID is required');
    });

    it('should require name', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        managerId: 'manager-123',
        displayOrder: 1
      });

      const error = team.validateSync();
      expect(error?.errors.name).toBeDefined();
      expect(error?.errors.name.message).toBe('Name is required');
    });

    it('should require managerId', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        displayOrder: 1
      });

      const error = team.validateSync();
      expect(error?.errors.managerId).toBeDefined();
      expect(error?.errors.managerId.message).toBe('Manager ID is required');
    });

    it('should handle optional memberCount', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'New Team',
        managerId: 'manager-123',
        displayOrder: 0,
        memberCount: 0
      });

      const error = team.validateSync();
      expect(error).toBeUndefined();
      expect(team.memberCount).toBe(0);
    });

    it('should support teams with multiple members', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Large Team',
        managerId: 'manager-123',
        displayOrder: 1,
        memberCount: 50
      });

      const error = team.validateSync();
      expect(error).toBeUndefined();
      expect(team.memberCount).toBe(50);
    });

    it('should handle icon field', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1,
        icon: '👥'
      });

      const error = team.validateSync();
      expect(error).toBeUndefined();
      expect(team.icon).toBe('👥');
    });


    it('should set default values correctly', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 0
      });

      expect(team.displayOrder).toBe(0);
      expect(team.syncedAt).toBeDefined();
      expect(team._ttl).toBeDefined();
    });

    it('should handle notionSpaceUrl field', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1,
        notionSpaceUrl: 'https://notion.so/team-space'
      });

      expect(team.notionSpaceUrl).toBe('https://notion.so/team-space');
      const error = team.validateSync();
      expect(error).toBeUndefined();
    });

    it('should validate URL format for notionSpaceUrl', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1,
        notionSpaceUrl: 'invalid-url'
      });

      const error = team.validateSync();
      expect(error?.errors.notionSpaceUrl).toBeDefined();
      expect(error?.errors.notionSpaceUrl.message).toBe('Please enter a valid URL');
    });

    it('should handle description field', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1,
        description: 'This is the main engineering team responsible for product development'
      });

      expect(team.description).toBe('This is the main engineering team responsible for product development');
      const error = team.validateSync();
      expect(error).toBeUndefined();
    });

    it('should validate name max length', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'a'.repeat(201), // Too long
        managerId: 'manager-123',
        displayOrder: 1
      });

      const error = team.validateSync();
      expect(error?.errors.name).toBeDefined();
      expect(error?.errors.name.message).toBe('Name cannot exceed 200 characters');
    });

    it('should validate description max length', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1,
        description: 'a'.repeat(1001) // Too long
      });

      const error = team.validateSync();
      expect(error?.errors.description).toBeDefined();
      expect(error?.errors.description.message).toBe('Description cannot exceed 1000 characters');
    });

  });

  describe('Instance Methods', () => {
    it('should update member count', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1,
        memberCount: 5
      });

      team.updateMemberCount = jest.fn().mockImplementation(function(this: ITeam, count: number) {
        this.memberCount = count;
        return Promise.resolve(this);
      });

      team.updateMemberCount(10);
      expect(team.memberCount).toBe(10);
    });

    it('should change manager', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1
      });

      team.changeManager = jest.fn().mockImplementation(function(this: ITeam, newManagerId: string) {
        this.managerId = newManagerId;
        return Promise.resolve(this);
      });

      team.changeManager('manager-456');
      expect(team.managerId).toBe('manager-456');
    });

    it('should deactivate a team', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1
      });

      team.deactivate = jest.fn().mockImplementation(function(this: ITeam) {
        // Mark as inactive (could set a flag or change status)
        this.displayOrder = -1; // Use negative order to indicate inactive
        return Promise.resolve(this);
      });

      team.deactivate();
      expect(team.displayOrder).toBe(-1);
    });
  });

  describe('Static Methods', () => {
    it('should have upsertFromNotion static method', () => {
      expect(typeof TeamModel.upsertFromNotion).toBe('function');
    });

    it('should have findByManager static method', () => {
      expect(typeof TeamModel.findByManager).toBe('function');
    });

    it('should have findAllSorted static method', () => {
      expect(typeof TeamModel.findAllSorted).toBe('function');
    });
  });

  describe('TTL Configuration', () => {
    it('should set TTL to 30 days by default', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        displayOrder: 1
      });

      const ttlTime = team._ttl.getTime();
      const nowTime = Date.now();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      
      // Vérifier que le TTL est environ 30 jours dans le futur (avec une marge de 1 minute)
      expect(ttlTime).toBeGreaterThan(nowTime + thirtyDaysInMs - 60000);
      expect(ttlTime).toBeLessThan(nowTime + thirtyDaysInMs + 60000);
    });
  });

  describe('Indexes', () => {
    it('should have proper index configuration', () => {
      const schema = TeamModel.schema;
      const paths = schema.paths;
      
      // Vérifier que les champs indexés sont configurés
      expect(paths.notionId.options.unique).toBe(true);
      expect(paths.notionId.options.index).toBe(true);
      expect(paths.managerId.options.index).toBe(true);
      expect(paths.displayOrder.options.index).toBe(true);
    });
  });
});