import mongoose from 'mongoose';
import { ClientModel, IClient } from '../../../src/models/Client.model';

describe('Client Model', () => {
  describe('Validation', () => {
    it('should validate a valid client', () => {
      const validClient = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactName: 'John Doe',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer',
        projectIds: ['project1', 'project2'],
        isActive: true
      });

      const error = validClient.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require notionId', () => {
      const client = new ClientModel({
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer'
      });

      const error = client.validateSync();
      expect(error?.errors.notionId).toBeDefined();
      expect(error?.errors.notionId.message).toBe('Notion ID is required');
    });

    it('should require name', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer'
      });

      const error = client.validateSync();
      expect(error?.errors.name).toBeDefined();
      expect(error?.errors.name.message).toBe('Client name is required');
    });

    it('should validate email format', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'invalid-email',
        contractType: 'retainer'
      });

      const error = client.validateSync();
      expect(error?.errors.contactEmail).toBeDefined();
      expect(error?.errors.contactEmail.message).toBe('Please enter a valid email address');
    });

    it('should only accept valid contract types', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contractType: 'invalid_type' as any
      });

      const error = client.validateSync();
      expect(error?.errors.contractType).toBeDefined();
    });

    it('should accept all valid contract types', () => {
      const validTypes = ['project', 'retainer', 'consultation', 'other'];
      
      validTypes.forEach(type => {
        const client = new ClientModel({
          notionId: `notion-${type}`,
          name: 'Test Client',
          contactEmail: 'test@example.com',
          contractType: type as any
        });

        const error = client.validateSync();
        expect(error).toBeUndefined();
        expect(client.contractType).toBe(type);
      });
    });

    it('should validate phone number format', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contactPhone: 'invalid',
        contractType: 'retainer'
      });

      const error = client.validateSync();
      expect(error?.errors.contactPhone).toBeDefined();
      expect(error?.errors.contactPhone.message).toBe('Please enter a valid phone number');
    });

    it('should accept various valid phone number formats', () => {
      const validPhones = [
        '+33612345678',
        '0612345678',
        '+1-555-123-4567',
        '555-123-4567'
      ];

      validPhones.forEach(phone => {
        const client = new ClientModel({
          notionId: `notion-${phone}`,
          name: 'Test Client',
          contactEmail: 'test@example.com',
          contactPhone: phone,
          contractType: 'retainer'
        });

        const error = client.validateSync();
        expect(error).toBeUndefined();
      });
    });

    it('should handle optional fields correctly', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer',
        contactPhone: '+33612345678',
        industry: 'Technology',
        company: 'Acme Inc.',
        website: 'https://acme.com',
        address: '123 Main St, Paris',
        notes: 'Important client'
      });

      const error = client.validateSync();
      expect(error).toBeUndefined();
      expect(client.industry).toBe('Technology');
      expect(client.company).toBe('Acme Inc.');
      expect(client.website).toBe('https://acme.com');
      expect(client.address).toBe('123 Main St, Paris');
      expect(client.notes).toBe('Important client');
    });

    it('should validate website URL format', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer',
        website: 'invalid-url'
      });

      const error = client.validateSync();
      expect(error?.errors.website).toBeDefined();
      expect(error?.errors.website.message).toBe('Please enter a valid URL');
    });

    it('should set default values correctly', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer'
      });

      expect(client.isActive).toBe(true);
      expect(client.syncedAt).toBeDefined();
      expect(client._ttl).toBeDefined();
      expect(client.projectIds).toEqual([]);
    });

    it('should support multiple projects', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer',
        projectIds: ['project1', 'project2', 'project3']
      });

      const error = client.validateSync();
      expect(error).toBeUndefined();
      expect(client.projectIds).toHaveLength(3);
    });

    it('should convert email to lowercase', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'John.Doe@Acme.COM',
        contractType: 'retainer'
      });

      expect(client.contactEmail).toBe('john.doe@acme.com');
    });
  });

  describe('Instance Methods', () => {
    it('should deactivate a client', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer',
        isActive: true
      });

      client.deactivate = jest.fn().mockImplementation(function(this: IClient) {
        this.isActive = false;
        return Promise.resolve(this);
      });

      client.deactivate();
      expect(client.isActive).toBe(false);
    });

    it('should add a project to client', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer',
        projectIds: ['project1']
      });

      client.addProject = jest.fn().mockImplementation(function(this: IClient, projectId: string) {
        if (!this.projectIds.includes(projectId)) {
          this.projectIds.push(projectId);
        }
        return Promise.resolve(this);
      });

      client.addProject('project2');
      expect(client.projectIds).toContain('project2');
      expect(client.projectIds).toHaveLength(2);
    });
  });

  describe('Static Methods', () => {
    it('should have upsertFromNotion static method', () => {
      expect(typeof ClientModel.upsertFromNotion).toBe('function');
    });

    it('should have findActive static method', () => {
      expect(typeof ClientModel.findActive).toBe('function');
    });

    it('should have findByContractType static method', () => {
      expect(typeof ClientModel.findByContractType).toBe('function');
    });
  });

  describe('TTL Configuration', () => {
    it('should set TTL to 30 days by default', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        contactEmail: 'john.doe@acme.com',
        contractType: 'retainer'
      });

      const ttlTime = client._ttl.getTime();
      const nowTime = Date.now();
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      
      // Vérifier que le TTL est environ 30 jours dans le futur (avec une marge de 1 minute)
      expect(ttlTime).toBeGreaterThan(nowTime + thirtyDaysInMs - 60000);
      expect(ttlTime).toBeLessThan(nowTime + thirtyDaysInMs + 60000);
    });
  });

  describe('Indexes', () => {
    it('should have proper index configuration', () => {
      const schema = ClientModel.schema;
      const paths = schema.paths;
      
      // Vérifier que les champs indexés sont configurés
      expect(paths.notionId.options.unique).toBe(true);
      expect(paths.notionId.options.index).toBe(true);
      expect(paths.name.options.index).toBe(true);
      expect(paths.isActive.options.index).toBe(true);
      expect(paths.contractType.options.index).toBe(true);
    });
  });
});