import logger from '../config/logger.config';

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000,
  context?: string
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryableError = error.status >= 500 || error.status === 429;
      
      if (isLastAttempt || !isRetryableError) {
        logger.error(`Failed after ${attempt + 1} attempts${context ? ` [${context}]` : ''}`, {
          error: error.message,
          status: error.status,
          attempt: attempt + 1
        });
        throw error;
      }
      
      const delay = initialDelay * Math.pow(2, attempt);
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries}${context ? ` [${context}]` : ''} after ${delay}ms`, {
        error: error.message,
        status: error.status,
        nextDelay: delay
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`Max retries reached${context ? ` for ${context}` : ''}`);
}