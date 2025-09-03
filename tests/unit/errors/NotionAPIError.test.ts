import { NotionAPIError } from '../../../src/errors/NotionAPIError';

describe('NotionAPIError', () => {
  describe('constructor', () => {
    it('should create error with all properties', () => {
      const error = new NotionAPIError(
        'Test error message',
        'TEST_ERROR',
        400,
        { additional: 'details' }
      );

      expect(error.message).toBe('Test error message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.status).toBe(400);
      expect(error.details).toEqual({ additional: 'details' });
      expect(error.name).toBe('NotionAPIError');
    });

    it('should create error without details', () => {
      const error = new NotionAPIError(
        'Test error',
        'ERROR_CODE',
        500
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('ERROR_CODE');
      expect(error.status).toBe(500);
      expect(error.details).toBeUndefined();
    });
  });

  describe('fromError', () => {
    it('should handle 429 rate limit error', () => {
      const sourceError = {
        status: 429,
        headers: { 'retry-after': '60' }
      };

      const error = NotionAPIError.fromError(sourceError);

      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.status).toBe(429);
      expect(error.message).toBe('Rate limit exceeded, please retry later');
      expect(error.details).toEqual({ retryAfter: '60' });
    });

    it('should handle 401 authentication error', () => {
      const sourceError = {
        status: 401,
        message: 'Unauthorized'
      };

      const error = NotionAPIError.fromError(sourceError);

      expect(error.code).toBe('AUTHENTICATION_FAILED');
      expect(error.status).toBe(401);
      expect(error.message).toBe('Authentication failed - invalid Notion API token');
    });

    it('should handle 400 bad request error', () => {
      const sourceError = {
        status: 400,
        message: 'Invalid request',
        body: { error: 'details' }
      };

      const error = NotionAPIError.fromError(sourceError);

      expect(error.code).toBe('BAD_REQUEST');
      expect(error.status).toBe(400);
      expect(error.message).toBe('Invalid request');
      expect(error.details).toEqual({ error: 'details' });
    });

    it('should handle 404 not found error', () => {
      const sourceError = {
        status: 404
      };

      const error = NotionAPIError.fromError(sourceError);

      expect(error.code).toBe('NOT_FOUND');
      expect(error.status).toBe(404);
      expect(error.message).toBe('Resource not found in Notion');
    });

    it('should handle 500+ service errors', () => {
      const sourceError = {
        status: 503,
        message: 'Service unavailable'
      };

      const error = NotionAPIError.fromError(sourceError);

      expect(error.code).toBe('SERVICE_ERROR');
      expect(error.status).toBe(503);
      expect(error.message).toBe('Notion API service error');
      expect(error.details).toEqual({ originalError: 'Service unavailable' });
    });

    it('should handle unknown errors', () => {
      const sourceError = {
        message: 'Something went wrong'
      };

      const error = NotionAPIError.fromError(sourceError);

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.status).toBe(500);
      expect(error.message).toBe('Something went wrong');
    });

    it('should handle errors without message or status', () => {
      const sourceError = {};

      const error = NotionAPIError.fromError(sourceError);

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.status).toBe(500);
      expect(error.message).toBe('Unknown Notion API error');
    });
  });

  describe('toUserMessage', () => {
    it('should return French message for RATE_LIMIT_EXCEEDED', () => {
      const error = new NotionAPIError('', 'RATE_LIMIT_EXCEEDED', 429);
      expect(error.toUserMessage()).toBe(
        'Trop de requêtes. Veuillez réessayer dans quelques secondes.'
      );
    });

    it('should return French message for AUTHENTICATION_FAILED', () => {
      const error = new NotionAPIError('', 'AUTHENTICATION_FAILED', 401);
      expect(error.toUserMessage()).toBe(
        "Erreur d'authentification avec Notion. Vérifiez la configuration."
      );
    });

    it('should return French message for BAD_REQUEST', () => {
      const error = new NotionAPIError('', 'BAD_REQUEST', 400);
      expect(error.toUserMessage()).toBe(
        'Requête invalide. Vérifiez les données envoyées.'
      );
    });

    it('should return French message for NOT_FOUND', () => {
      const error = new NotionAPIError('', 'NOT_FOUND', 404);
      expect(error.toUserMessage()).toBe(
        'Ressource non trouvée dans Notion.'
      );
    });

    it('should return French message for SERVICE_ERROR', () => {
      const error = new NotionAPIError('', 'SERVICE_ERROR', 500);
      expect(error.toUserMessage()).toBe(
        'Service Notion temporairement indisponible.'
      );
    });

    it('should return default French message for unknown error', () => {
      const error = new NotionAPIError('', 'UNKNOWN_CODE', 500);
      expect(error.toUserMessage()).toBe(
        "Une erreur inattendue s'est produite avec Notion."
      );
    });
  });
});