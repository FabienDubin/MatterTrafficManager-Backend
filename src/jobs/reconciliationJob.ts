import { CronJob } from 'cron';
import { notionSyncService } from '../services/notionSync.service';
import notionMappingService from '../services/notionMapping.service';
import { TaskModel } from '../models/Task.model';
import { ProjectModel } from '../models/Project.model';
import { MemberModel } from '../models/Member.model';
import { TeamModel } from '../models/Team.model';
import { ClientModel } from '../models/Client.model';
import { SyncLogModel } from '../models/SyncLog.model';
import logger from '../config/logger.config';

interface ReconciliationReport {
  entityType: string;
  totalInNotion: number;
  totalInMongoDB: number;
  missingInMongoDB: string[];
  outdated: string[];
  reconciled: number;
  failed: number;
  duration: number;
}

class ReconciliationJob {
  private job: CronJob | null = null;

  /**
   * Initialize reconciliation job (runs daily at 3 AM)
   */
  initialize(): void {
    const cronPattern = '0 0 3 * * *'; // Daily at 3 AM

    this.job = new CronJob(
      cronPattern,
      async () => {
        await this.runReconciliation();
      },
      null,
      true,
      'Europe/Paris'
    );

    logger.info('✅ Initialized reconciliation job (daily at 3 AM)');
  }

  /**
   * Run full reconciliation
   */
  async runReconciliation(): Promise<ReconciliationReport[]> {
    logger.info('🔍 Starting full reconciliation process');
    const startTime = Date.now();
    const reports: ReconciliationReport[] = [];

    const entityTypes = [
      { name: 'Task', model: TaskModel },
      { name: 'Project', model: ProjectModel },
      { name: 'Member', model: MemberModel },
      { name: 'Team', model: TeamModel },
      { name: 'Client', model: ClientModel }
    ];

    for (const { name, model } of entityTypes) {
      const report = await this.reconcileEntity(name, model);
      reports.push(report);
    }

    const totalDuration = Date.now() - startTime;
    
    // Log reconciliation summary
    await SyncLogModel.create({
      entityType: 'Reconciliation',
      syncMethod: 'reconciliation',
      syncStatus: 'success',
      itemsProcessed: reports.reduce((sum, r) => sum + r.reconciled, 0),
      itemsFailed: reports.reduce((sum, r) => sum + r.failed, 0),
      duration: totalDuration,
      phase: 'completed',
      metadata: { reports }
    });

    logger.info(`✅ Reconciliation completed in ${totalDuration}ms`, {
      reports: reports.map(r => ({
        entityType: r.entityType,
        reconciled: r.reconciled,
        failed: r.failed
      }))
    });

    return reports;
  }

  /**
   * Reconcile a single entity type
   */
  private async reconcileEntity(entityType: string, model: any): Promise<ReconciliationReport> {
    const startTime = Date.now();
    logger.info(`🔄 Reconciling ${entityType} entities`);

    const report: ReconciliationReport = {
      entityType,
      totalInNotion: 0,
      totalInMongoDB: 0,
      missingInMongoDB: [],
      outdated: [],
      reconciled: 0,
      failed: 0,
      duration: 0
    };

    try {
      // Get all Notion pages for this entity
      const notionPages = await this.fetchAllNotionPages(entityType);
      report.totalInNotion = notionPages.length;

      // Get all MongoDB documents
      const mongoDocuments = await model.find({}).lean();
      report.totalInMongoDB = mongoDocuments.length;

      // Create maps for quick lookup
      const mongoMap = new Map(mongoDocuments.map((doc: any) => [doc.notionId, doc]));
      const notionMap = new Map(notionPages.map(page => [page.id, page]));

      // Find missing and outdated entities
      for (const [notionId, page] of notionMap) {
        const mongoDoc = mongoMap.get(notionId);

        if (!mongoDoc) {
          // Missing in MongoDB
          report.missingInMongoDB.push(notionId);
          
          // Sync the missing entity
          try {
            await this.syncMissingEntity(entityType, notionId);
            report.reconciled++;
          } catch (error) {
            logger.error(`Failed to sync missing ${entityType} ${notionId}:`, error);
            report.failed++;
          }
        } else {
          // Check if outdated (Notion was updated after last sync)
          const notionUpdated = new Date(page.last_edited_time);
          const lastSynced = (mongoDoc as any).lastSyncedAt || new Date(0);

          if (notionUpdated > lastSynced) {
            report.outdated.push(notionId);
            
            // Resync outdated entity
            try {
              await this.syncMissingEntity(entityType, notionId);
              report.reconciled++;
            } catch (error) {
              logger.error(`Failed to resync outdated ${entityType} ${notionId}:`, error);
              report.failed++;
            }
          }
        }
      }

      // Clean up orphaned MongoDB documents (exist in MongoDB but not in Notion)
      const orphaned = mongoDocuments.filter((doc: any) => !notionMap.has(doc.notionId));
      if (orphaned.length > 0) {
        logger.info(`Found ${orphaned.length} orphaned ${entityType} documents in MongoDB`);
        
        // Mark as deleted (don't actually delete, for audit purposes)
        await model.updateMany(
          { notionId: { $in: orphaned.map((doc: any) => doc.notionId) } },
          { 
            $set: { 
              deletedFromNotion: true,
              deletedAt: new Date()
            }
          }
        );
      }

    } catch (error) {
      logger.error(`Reconciliation failed for ${entityType}:`, error);
      report.failed = report.totalInNotion;
    }

    report.duration = Date.now() - startTime;
    return report;
  }

  /**
   * Fetch all pages from Notion for an entity type
   */
  private async fetchAllNotionPages(entityType: string): Promise<any[]> {
    // This would normally call the Notion API to get all pages
    // For now, returning empty array as we need to implement the service method
    try {
      const result = await notionSyncService.fetchAllPagesForEntity(entityType);
      return result;
    } catch (error) {
      logger.error(`Failed to fetch Notion pages for ${entityType}:`, error);
      return [];
    }
  }

  /**
   * Sync a missing or outdated entity
   */
  private async syncMissingEntity(entityType: string, notionId: string): Promise<void> {
    switch (entityType) {
      case 'Task':
        await notionMappingService.mapTaskToMongoDB(notionId);
        break;
      case 'Project':
        await notionMappingService.mapProjectToMongoDB(notionId);
        break;
      case 'Member':
        await notionMappingService.mapMemberToMongoDB(notionId);
        break;
      case 'Team':
        await notionMappingService.mapTeamToMongoDB(notionId);
        break;
      case 'Client':
        await notionMappingService.mapClientToMongoDB(notionId);
        break;
    }
  }

  /**
   * Stop the reconciliation job
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      logger.info('⏹️  Stopped reconciliation job');
    }
  }

  /**
   * Trigger manual reconciliation
   */
  async triggerManual(): Promise<ReconciliationReport[]> {
    logger.info('🔧 Manual reconciliation triggered');
    return this.runReconciliation();
  }

  /**
   * Get job status
   */
  getStatus(): any {
    if (!this.job) {
      return { running: false };
    }

    return {
      running: (this.job as any).running || false,
      nextDate: this.job.nextDate()?.toISO() || null
    };
  }
}

export const reconciliationJob = new ReconciliationJob();