export class NotionAPIError extends Error {
  public code: string;
  public status: number;
  public details?: any;

  constructor(
    message: string,
    code: string,
    status: number,
    details?: any
  ) {
    super(message);
    this.name = 'NotionAPIError';
    this.code = code;
    this.status = status;
    this.details = details;
    
    Error.captureStackTrace(this, this.constructor);
  }

  static fromError(error: any): NotionAPIError {
    if (error.status === 429) {
      return new NotionAPIError(
        'Rate limit exceeded, please retry later',
        'RATE_LIMIT_EXCEEDED',
        429,
        { retryAfter: error.headers?.['retry-after'] }
      );
    }

    if (error.status === 401) {
      return new NotionAPIError(
        'Authentication failed - invalid Notion API token',
        'AUTHENTICATION_FAILED',
        401
      );
    }

    if (error.status === 400) {
      return new NotionAPIError(
        error.message || 'Bad request to Notion API',
        'BAD_REQUEST',
        400,
        error.body
      );
    }

    if (error.status === 404) {
      return new NotionAPIError(
        'Resource not found in Notion',
        'NOT_FOUND',
        404
      );
    }

    if (error.status >= 500) {
      return new NotionAPIError(
        'Notion API service error',
        'SERVICE_ERROR',
        error.status || 500,
        { originalError: error.message }
      );
    }

    return new NotionAPIError(
      error.message || 'Unknown Notion API error',
      'UNKNOWN_ERROR',
      error.status || 500,
      error
    );
  }

  toUserMessage(): string {
    switch (this.code) {
      case 'RATE_LIMIT_EXCEEDED':
        return 'Trop de requêtes. Veuillez réessayer dans quelques secondes.';
      case 'AUTHENTICATION_FAILED':
        return 'Erreur d\'authentification avec Notion. Vérifiez la configuration.';
      case 'BAD_REQUEST':
        return 'Requête invalide. Vérifiez les données envoyées.';
      case 'NOT_FOUND':
        return 'Ressource non trouvée dans Notion.';
      case 'SERVICE_ERROR':
        return 'Service Notion temporairement indisponible.';
      default:
        return 'Une erreur inattendue s\'est produite avec Notion.';
    }
  }
}