import Bottleneck from 'bottleneck';
import logger from '../config/logger.config';

const limiter = new Bottleneck({
  minTime: 334, // ~3 requests per second (1000ms / 3 = 333.33ms)
  maxConcurrent: 1,
  reservoir: 3,
  reservoirRefreshInterval: 1000,
  reservoirRefreshAmount: 3
});

export async function throttledNotionCall<T>(
  fn: () => Promise<T>,
  operation?: string
): Promise<T> {
  const startTime = Date.now();
  const result = await limiter.schedule(fn);
  const waitTime = Date.now() - startTime;
  
  if (waitTime > 100) {
    logger.debug(`Rate limiter delayed request by ${waitTime}ms${operation ? ` for ${operation}` : ''}`);
  }
  
  const duration = Date.now() - startTime;
  
  logger.debug(`Notion API call completed${operation ? ` [${operation}]` : ''}`, {
    duration,
    waitTime
  });
  
  return result;
}

export async function batchNotionCalls<T>(
  calls: Array<() => Promise<T>>,
  batchSize = 3
): Promise<T[]> {
  const results: T[] = [];
  
  for (let i = 0; i < calls.length; i += batchSize) {
    const batch = calls.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(call => throttledNotionCall(call))
    );
    results.push(...batchResults);
    
    if (i + batchSize < calls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

export function getRateLimiterStats() {
  return {
    remainingTokens: limiter.counts().RECEIVED,
    tokensPerInterval: 3,
    interval: 'second'
  };
}