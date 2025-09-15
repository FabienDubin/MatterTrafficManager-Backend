import { ClientModel } from '../../../src/models/Client.model';

describe('Client Model', () => {
  describe('Validation', () => {
    it('should validate a valid client', () => {
      const validClient = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation',
        status: 'active',
        lastNotionSync: new Date()
      });

      const error = validClient.validateSync();
      expect(error).toBeUndefined();
    });

    it('should require notionId and name', () => {
      const client = new ClientModel({});
      const error = client.validateSync();
      expect(error?.errors.notionId).toBeDefined();
      expect(error?.errors.name).toBeDefined();
    });

    it('should validate email format', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme',
        primaryContactEmail: 'invalid-email'
      });

      const error = client.validateSync();
      expect(error?.errors.primaryContactEmail).toBeDefined();
    });

    it('should set default TTL to 30 days', () => {
      const client = new ClientModel({
        notionId: 'notion-123',
        name: 'Acme Corporation'
      });

      expect(client._ttl).toBeDefined();
      const ttlTime = client._ttl.getTime() - Date.now();
      expect(ttlTime).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
      expect(ttlTime).toBeLessThan(31 * 24 * 60 * 60 * 1000);
    });
  });

  describe('Static Methods', () => {
    it('should have upsertFromNotion method', () => {
      expect(ClientModel.upsertFromNotion).toBeDefined();
      expect(typeof ClientModel.upsertFromNotion).toBe('function');
    });

    it('should have findActive method', () => {
      expect(ClientModel.findActive).toBeDefined();
      expect(typeof ClientModel.findActive).toBe('function');
    });
  });
});