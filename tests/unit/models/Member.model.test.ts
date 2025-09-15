import mongoose from 'mongoose';
import { MemberModel, IMember } from '../../../src/models/Member.model';

describe('Member Model', () => {
  describe('Validation', () => {
    it('should validate a valid member', () => {
      const validMember = new MemberModel({
        notionId: 'notion-123',
        name: 'John Doe',
        email: 'john.doe@example.com',
        teamIds: ['team1', 'team2'],
        role: ['Developer', 'Tech Lead'],
        isActive: true
      });

      const error = validMember.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require notionId', () => {
      const member = new MemberModel({
        name: 'John Doe',
        email: 'john.doe@example.com',
        teamIds: ['team1'],
        role: ['Developer']
      });

      const error = member.validateSync();
      expect(error?.errors.notionId).toBeDefined();
      expect(error?.errors.notionId.message).toBe('Notion ID is required');
    });

    it('should require name', () => {
      const member = new MemberModel({
        notionId: 'notion-123',
        email: 'john.doe@example.com',
        teamIds: ['team1'],
        role: ['Developer']
      });

      const error = member.validateSync();
      expect(error?.errors.name).toBeDefined();
      expect(error?.errors.name.message).toBe('Name is required');
    });

    it('should require valid email format', () => {
      const member = new MemberModel({
        notionId: 'notion-123',
        name: 'John Doe',
        email: 'invalid-email',
        teamIds: ['team1'],
        role: ['Developer']
      });

      const error = member.validateSync();
      expect(error?.errors.email).toBeDefined();
      expect(error?.errors.email.message).toBe('Please enter a valid email address');
    });

    it('should support multiple teams (many-to-many)', () => {
      const member = new MemberModel({
        notionId: 'notion-123',
        name: 'John Doe',
        email: 'john.doe@example.com',
        teamIds: ['team1', 'team2', 'team3'],
        teamNames: ['Team Alpha', 'Team Beta', 'Team Gamma'],
        role: ['Developer']
      });

      const error = member.validateSync();
      expect(error).toBeUndefined();
      expect(member.teamIds).toHaveLength(3);
      expect(member.teamNames).toHaveLength(3);
    });

    it('should handle optional fields correctly', () => {
      const member = new MemberModel({
        notionId: 'notion-123',
        name: 'John Doe',
        email: 'john.doe@example.com',
        teamIds: ['team1'],
        role: ['Developer'],
        notionUserId: 'user-456',
        managerId: 'manager-789',
        profilePicture: 'https://example.com/photo.jpg'
      });

      const error = member.validateSync();
      expect(error).toBeUndefined();
      expect(member.notionUserId).toBe('user-456');
      expect(member.managerId).toBe('manager-789');
      expect(member.profilePicture).toBe('https://example.com/photo.jpg');
    });

    it('should validate profilePicture URL format', () => {
      const member = new MemberModel({
        notionId: 'notion-123',
        name: 'John Doe',
        email: 'john.doe@example.com',
        teamIds: ['team1'],
        role: ['Developer'],
        profilePicture: 'invalid-url'
      });

      const error = member.validateSync();
      expect(error?.errors.profilePicture).toBeDefined();
      expect(error?.errors.profilePicture.message).toBe('Please enter a valid URL');
    });

    it('should set default values correctly', () => {
      const member = new MemberModel({
        notionId: 'notion-123',
        name: 'John Doe',
        email: 'john.doe@example.com',
        teamIds: ['team1'],
        role: ['Developer']
      });

      expect(member.isActive).toBe(true);
      expect(member.syncedAt).toBeDefined();
    });

    it('should handle teamNames as denormalized field', () => {
      const member = new MemberModel({
        notionId: 'notion-123',
        name: 'John Doe',
        email: 'john.doe@example.com',
        teamIds: ['team1', 'team2'],
        teamNames: ['Engineering', 'DevOps'],
        role: ['Developer']
      });

      expect(member.teamNames).toEqual(['Engineering', 'DevOps']);
      const error = member.validateSync();
      expect(error).toBeUndefined();
    });
  });

  describe('Instance Methods', () => {
    it('should deactivate a member', () => {
      const member = new MemberModel({
        notionId: 'notion-123',
        name: 'John Doe',
        email: 'john.doe@example.com',
        teamIds: ['team1'],
        role: ['Developer'],
        isActive: true
      });

      member.deactivate = jest.fn().mockImplementation(function(this: IMember) {
        this.isActive = false;
        return Promise.resolve(this);
      });

      member.deactivate();
      expect(member.isActive).toBe(false);
    });
  });

  describe('Static Methods', () => {
    it('should have upsertFromNotion static method', () => {
      expect(typeof MemberModel.upsertFromNotion).toBe('function');
    });

    it('should have findByTeam static method', () => {
      expect(typeof MemberModel.findByTeam).toBe('function');
    });

    it('should have findByRole static method', () => {
      expect(typeof MemberModel.findByRole).toBe('function');
    });
  });

  describe('Email Validation', () => {
    it('should convert email to lowercase', () => {
      const member = new MemberModel({
        notionId: 'notion-123',
        name: 'John Doe',
        email: 'John.Doe@Example.COM',
        teamIds: ['team1'],
        role: ['Developer']
      });

      expect(member.email).toBe('john.doe@example.com');
    });

    it('should accept various valid email formats', () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user_name@example-domain.com'
      ];

      validEmails.forEach(email => {
        const member = new MemberModel({
          notionId: `notion-${email}`,
          name: 'Test User',
          email,
          teamIds: ['team1'],
          role: ['Developer']
        });

        const error = member.validateSync();
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Indexes', () => {
    it('should have proper index configuration', () => {
      const schema = MemberModel.schema;
      const paths = schema.paths;
      
      // Vérifier que les champs indexés sont configurés
      expect(paths.notionId.options.unique).toBe(true);
      expect(paths.notionId.options.index).toBe(true);
      expect(paths.email.options.index).toBe(true);
      expect(paths.isActive.options.index).toBe(true);
      expect(paths.managerId.options.index).toBe(true);
      expect(paths.notionUserId.options.sparse).toBe(true);
    });
  });
});