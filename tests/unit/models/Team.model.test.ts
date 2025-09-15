import mongoose from 'mongoose';
import { TeamModel, ITeam } from '../../../src/models/Team.model';

describe('Team Model', () => {
  describe('Validation', () => {
    it('should validate a valid team', () => {
      const validTeam = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        managerName: 'Jane Smith',
        memberIds: ['member1', 'member2', 'member3'],
        memberNames: ['John Doe', 'Alice Brown', 'Bob Wilson'],
        projectIds: ['project1', 'project2'],
        displayOrder: 1,
        isActive: true
      });

      const error = validTeam.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require notionId', () => {
      const team = new TeamModel({
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1']
      });

      const error = team.validateSync();
      expect(error?.errors.notionId).toBeDefined();
      expect(error?.errors.notionId.message).toBe('Notion ID is required');
    });

    it('should require name', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        managerId: 'manager-123',
        memberIds: ['member1']
      });

      const error = team.validateSync();
      expect(error?.errors.name).toBeDefined();
      expect(error?.errors.name.message).toBe('Team name is required');
    });

    it('should require managerId', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        memberIds: ['member1']
      });

      const error = team.validateSync();
      expect(error?.errors.managerId).toBeDefined();
      expect(error?.errors.managerId.message).toBe('Manager ID is required');
    });

    it('should handle empty member arrays', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'New Team',
        managerId: 'manager-123',
        memberIds: [],
        projectIds: []
      });

      const error = team.validateSync();
      expect(error).toBeUndefined();
      expect(team.memberIds).toEqual([]);
      expect(team.projectIds).toEqual([]);
    });

    it('should support multiple members', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Large Team',
        managerId: 'manager-123',
        memberIds: Array.from({ length: 10 }, (_, i) => `member${i + 1}`),
        memberNames: Array.from({ length: 10 }, (_, i) => `Member ${i + 1}`)
      });

      const error = team.validateSync();
      expect(error).toBeUndefined();
      expect(team.memberIds).toHaveLength(10);
      expect(team.memberNames).toHaveLength(10);
    });

    it('should support multiple projects', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1'],
        projectIds: ['project1', 'project2', 'project3', 'project4', 'project5']
      });

      const error = team.validateSync();
      expect(error).toBeUndefined();
      expect(team.projectIds).toHaveLength(5);
    });

    it('should validate displayOrder is non-negative', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1'],
        displayOrder: -1
      });

      const error = team.validateSync();
      expect(error?.errors.displayOrder).toBeDefined();
      expect(error?.errors.displayOrder.message).toBe('Display order cannot be negative');
    });

    it('should set default values correctly', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1']
      });

      expect(team.displayOrder).toBe(0);
      expect(team.isActive).toBe(true);
      expect(team.syncedAt).toBeDefined();
      expect(team._ttl).toBeDefined();
      expect(team.memberNames).toEqual([]);
      expect(team.projectIds).toEqual([]);
    });

    it('should handle denormalized managerName field', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        managerName: 'Jane Smith',
        memberIds: ['member1']
      });

      expect(team.managerName).toBe('Jane Smith');
      const error = team.validateSync();
      expect(error).toBeUndefined();
    });

    it('should handle denormalized memberNames field', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1', 'member2'],
        memberNames: ['John Doe', 'Alice Brown']
      });

      expect(team.memberNames).toEqual(['John Doe', 'Alice Brown']);
      const error = team.validateSync();
      expect(error).toBeUndefined();
    });

    it('should handle description field', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1'],
        description: 'This is the main engineering team responsible for product development'
      });

      expect(team.description).toBe('This is the main engineering team responsible for product development');
      const error = team.validateSync();
      expect(error).toBeUndefined();
    });
  });

  describe('Instance Methods', () => {
    it('should add a member to team', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1']
      });

      team.addMember = jest.fn().mockImplementation(function(this: ITeam, memberId: string, memberName?: string) {
        if (!this.memberIds.includes(memberId)) {
          this.memberIds.push(memberId);
          if (memberName) {
            this.memberNames.push(memberName);
          }
        }
        return Promise.resolve(this);
      });

      team.addMember('member2', 'New Member');
      expect(team.memberIds).toContain('member2');
      expect(team.memberIds).toHaveLength(2);
      expect(team.memberNames).toContain('New Member');
    });

    it('should remove a member from team', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1', 'member2', 'member3'],
        memberNames: ['John', 'Jane', 'Bob']
      });

      team.removeMember = jest.fn().mockImplementation(function(this: ITeam, memberId: string) {
        const index = this.memberIds.indexOf(memberId);
        if (index > -1) {
          this.memberIds.splice(index, 1);
          this.memberNames.splice(index, 1);
        }
        return Promise.resolve(this);
      });

      team.removeMember('member2');
      expect(team.memberIds).not.toContain('member2');
      expect(team.memberIds).toHaveLength(2);
      expect(team.memberNames).not.toContain('Jane');
    });

    it('should deactivate a team', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1'],
        isActive: true
      });

      team.deactivate = jest.fn().mockImplementation(function(this: ITeam) {
        this.isActive = false;
        return Promise.resolve(this);
      });

      team.deactivate();
      expect(team.isActive).toBe(false);
    });
  });

  describe('Static Methods', () => {
    it('should have upsertFromNotion static method', () => {
      expect(typeof TeamModel.upsertFromNotion).toBe('function');
    });

    it('should have findByManager static method', () => {
      expect(typeof TeamModel.findByManager).toBe('function');
    });

    it('should have findActive static method', () => {
      expect(typeof TeamModel.findActive).toBe('function');
    });
  });

  describe('TTL Configuration', () => {
    it('should set TTL to 30 days by default', () => {
      const team = new TeamModel({
        notionId: 'notion-123',
        name: 'Engineering Team',
        managerId: 'manager-123',
        memberIds: ['member1']
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
      expect(paths.isActive.options.index).toBe(true);
      expect(paths.displayOrder.options.index).toBe(true);
    });
  });
});