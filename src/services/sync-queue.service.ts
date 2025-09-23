/**
 * Service de synchronisation asynchrone avec Notion
 * 
 * Pattern : Queue en mémoire avec retry automatique
 * - Updates Redis immédiatement (< 100ms)
 * - Sync Notion en background
 * - Retry avec backoff exponentiel
 * - Notification en cas d'échec définitif
 */

import { EventEmitter } from 'events';
import logger from '../config/logger.config';
import notionService from './notion.service';
import { redisService } from './redis.service';
import { UpdateTaskInput, CreateTaskInput } from '../types/notion.types';
import { latencyMetricsService } from './latency-metrics.service';

interface QueueItem {
  id: string;
  type: 'create' | 'update' | 'delete';
  entityType: 'task' | 'project' | 'member';
  data: any;
  attempts: number;
  maxRetries: number;
  createdAt: Date;
  lastAttempt?: Date;
  error?: string;
}

class SyncQueueService extends EventEmitter {
  private queue: QueueItem[] = [];
  private processing: boolean = false;
  private readonly MAX_QUEUE_SIZE = parseInt(process.env.SYNC_QUEUE_MAX_SIZE || '100');
  private readonly RATE_LIMIT_DELAY = parseInt(process.env.SYNC_RATE_LIMIT_DELAY || '350'); // ~3 req/sec for Notion
  private readonly MAX_RETRIES = parseInt(process.env.SYNC_MAX_RETRIES || '3');
  
  // Metrics
  private metrics = {
    queued: 0,
    processed: 0,
    failed: 0,
    retries: 0,
    avgProcessingTime: 0
  };

  constructor() {
    super();
    this.startProcessing();
    logger.info('SyncQueueService initialized');
  }

  /**
   * Add a task creation to the queue
   */
  async queueTaskCreate(taskData: CreateTaskInput): Promise<{ id: string; queued: boolean }> {
    const tempId = this.generateTempId();
    
    // Save to Redis immediately with temp ID
    await redisService.set(
      `task:${tempId}`,
      { ...taskData, id: tempId, _temporary: true },
      'task'
    );

    // Add to sync queue
    const queued = this.addToQueue({
      id: tempId,
      type: 'create',
      entityType: 'task',
      data: taskData,
      attempts: 0,
      maxRetries: this.MAX_RETRIES,
      createdAt: new Date()
    });

    return { id: tempId, queued };
  }

  /**
   * Add a task update to the queue
   */
  async queueTaskUpdate(taskId: string, updateData: UpdateTaskInput): Promise<boolean> {
    // Update Redis immediately
    const cachedTask = await redisService.get(`task:${taskId}`);
    if (cachedTask) {
      await redisService.set(
        `task:${taskId}`,
        { ...cachedTask, ...updateData, _pendingSync: true },
        'task'
      );
    }

    // Add to sync queue
    return this.addToQueue({
      id: taskId,
      type: 'update',
      entityType: 'task',
      data: updateData,
      attempts: 0,
      maxRetries: this.MAX_RETRIES,
      createdAt: new Date()
    });
  }

  /**
   * Add a task deletion to the queue
   */
  async queueTaskDelete(taskId: string): Promise<boolean> {
    // Mark as deleted in Redis
    const cachedTask = await redisService.get(`task:${taskId}`);
    if (cachedTask) {
      await redisService.set(
        `task:${taskId}`,
        { ...cachedTask, _deleted: true, _pendingSync: true },
        'task'
      );
    }

    // Add to sync queue
    return this.addToQueue({
      id: taskId,
      type: 'delete',
      entityType: 'task',
      data: {},
      attempts: 0,
      maxRetries: this.MAX_RETRIES,
      createdAt: new Date()
    });
  }

  /**
   * Add item to queue with overflow protection
   */
  private addToQueue(item: QueueItem): boolean {
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      logger.warn('Sync queue is full, dropping oldest items', {
        queueSize: this.queue.length,
        maxSize: this.MAX_QUEUE_SIZE
      });
      
      // Remove oldest 10% to make room
      const toRemove = Math.ceil(this.MAX_QUEUE_SIZE * 0.1);
      const removed = this.queue.splice(0, toRemove);
      
      // Emit event for dropped items
      removed.forEach(droppedItem => {
        this.emit('item:dropped', droppedItem);
      });
    }

    this.queue.push(item);
    this.metrics.queued++;
    
    logger.debug('Item added to sync queue', {
      type: item.type,
      entityType: item.entityType,
      id: item.id,
      queueLength: this.queue.length
    });

    return true;
  }

  /**
   * Start processing queue items
   */
  private async startProcessing() {
    if (this.processing) return;
    
    this.processing = true;
    
    while (this.processing) {
      if (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item) {
          await this.processItem(item);
          // Rate limiting
          await this.delay(this.RATE_LIMIT_DELAY);
        }
      } else {
        // No items, wait a bit before checking again
        await this.delay(1000);
      }
    }
  }

  /**
   * Process a single queue item
   */
  private async processItem(item: QueueItem) {
    const startTime = Date.now();
    item.attempts++;
    item.lastAttempt = new Date();

    try {
      logger.debug('Processing sync queue item', {
        type: item.type,
        entityType: item.entityType,
        id: item.id,
        attempt: item.attempts
      });

      let result: any;

      // Process based on type and entity
      if (item.entityType === 'task') {
        switch (item.type) {
          case 'create':
            result = await notionService.createTask(item.data);
            // Replace temp ID with real Notion ID in Redis
            await redisService.del(`task:${item.id}`);
            await redisService.set(`task:${result.id}`, result, 'task');
            // Emit success event with mapping
            this.emit('task:created', { tempId: item.id, notionId: result.id, data: result });
            break;
            
          case 'update':
            result = await notionService.updateTask(item.id, item.data);
            // Update Redis with fresh data
            await redisService.set(`task:${item.id}`, result, 'task');
            this.emit('task:updated', { id: item.id, data: result });
            break;
            
          case 'delete':
            await notionService.archiveTask(item.id);
            // Remove from Redis
            await redisService.del(`task:${item.id}`);
            this.emit('task:deleted', { id: item.id });
            break;
        }
      }

      // Update metrics
      const processingTime = Date.now() - startTime;
      this.metrics.processed++;
      this.updateAvgProcessingTime(processingTime);
      
      // Record latency metrics
      latencyMetricsService.recordNotionLatency(processingTime, `sync-${item.type}`);
      latencyMetricsService.recordQueueLatency(0, processingTime, `${item.entityType}-${item.type}`);

      logger.info('Sync queue item processed successfully', {
        type: item.type,
        entityType: item.entityType,
        id: item.id,
        processingTime: `${processingTime}ms`,
        attempts: item.attempts
      });

      // Emit success event
      this.emit('item:success', { item, result, processingTime });

    } catch (error: any) {
      item.error = error.message;

      logger.error('Failed to process sync queue item', {
        type: item.type,
        entityType: item.entityType,
        id: item.id,
        attempt: item.attempts,
        error: error.message
      });

      // Check if we should retry
      if (item.attempts < item.maxRetries) {
        // Calculate backoff delay (exponential: 1s, 2s, 4s...)
        const backoffDelay = Math.pow(2, item.attempts - 1) * 1000;
        
        logger.info('Requeueing item with backoff', {
          id: item.id,
          attempt: item.attempts,
          nextAttemptIn: `${backoffDelay}ms`
        });

        this.metrics.retries++;
        
        // Requeue with delay
        setTimeout(() => {
          this.queue.push(item);
        }, backoffDelay);

        // Emit retry event
        this.emit('item:retry', { item, error: error.message, nextAttemptIn: backoffDelay });
        
      } else {
        // Max retries reached, handle failure
        this.metrics.failed++;
        
        logger.error('Max retries reached, item failed permanently', {
          type: item.type,
          entityType: item.entityType,
          id: item.id,
          attempts: item.attempts
        });

        // Rollback Redis if needed
        await this.handleFailure(item);

        // Emit failure event
        this.emit('item:failed', { item, error: error.message });
      }
    }
  }

  /**
   * Handle permanent failure
   */
  private async handleFailure(item: QueueItem) {
    if (item.entityType === 'task') {
      switch (item.type) {
        case 'create':
          // Remove failed temp task from Redis
          await redisService.del(`task:${item.id}`);
          break;
          
        case 'update':
          // Mark as sync failed in Redis
          const cachedTask = await redisService.get(`task:${item.id}`);
          if (cachedTask) {
            await redisService.set(
              `task:${item.id}`,
              { ...cachedTask, _syncError: true, _syncErrorMsg: item.error },
              'task'
            );
          }
          break;
          
        case 'delete':
          // Restore task in Redis (unmark as deleted)
          const deletedTask: any = await redisService.get(`task:${item.id}`);
          if (deletedTask) {
            delete deletedTask._deleted;
            deletedTask._syncError = true;
            deletedTask._syncErrorMsg = 'Failed to delete from Notion';
            await redisService.set(`task:${item.id}`, deletedTask, 'task');
          }
          break;
      }
    }
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      metrics: this.metrics,
      items: this.queue.map(item => ({
        id: item.id,
        type: item.type,
        entityType: item.entityType,
        attempts: item.attempts,
        createdAt: item.createdAt,
        lastAttempt: item.lastAttempt,
        error: item.error
      }))
    };
  }

  /**
   * Clear the queue
   */
  clearQueue() {
    const cleared = this.queue.length;
    this.queue = [];
    logger.info(`Cleared ${cleared} items from sync queue`);
    return cleared;
  }

  /**
   * Stop processing
   */
  stop() {
    this.processing = false;
    logger.info('SyncQueueService stopped');
  }

  /**
   * Helper functions
   */
  private generateTempId(): string {
    return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateAvgProcessingTime(newTime: number) {
    const total = this.metrics.processed;
    this.metrics.avgProcessingTime = 
      (this.metrics.avgProcessingTime * (total - 1) + newTime) / total;
  }
}

// Singleton instance
export const syncQueueService = new SyncQueueService();
export default syncQueueService;