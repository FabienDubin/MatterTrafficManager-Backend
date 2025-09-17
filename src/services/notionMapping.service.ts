import { Types } from 'mongoose';
import { Client } from '@notionhq/client';
import logger from '../config/logger.config';
import { 
  notionPageToTask,
  notionPageToUser,
  notionPageToProject,
  notionPageToClient,
  notionPageToTeam
} from '../mappers/notion.mapper';
import { TaskModel } from '../models/Task.model';
import { ProjectModel } from '../models/Project.model';
import { MemberModel } from '../models/Member.model';
import { TeamModel } from '../models/Team.model';
import { ClientModel } from '../models/Client.model';
import { SyncLogModel } from '../models/SyncLog.model';
import notionService from './notion.service';

interface MappingResult {
  success: boolean;
  entity?: any;
  error?: string;
}

interface BulkMappingResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

class NotionMappingService {
  private notion: Client;

  constructor() {
    this.notion = new Client({
      auth: process.env.NOTION_TOKEN || ''
    });
  }

  /**
   * Map and save a Notion task to MongoDB
   */
  async mapTaskToMongoDB(pageId: string): Promise<MappingResult> {
    try {
      logger.info(`Mapping Notion task ${pageId} to MongoDB`);
      
      // Get Notion page
      const page = await notionService.getTaskById(pageId);
      if (!page) {
        throw new Error(`Task ${pageId} not found in Notion`);
      }

      // Use existing mapper for basic extraction
      const notionTask = notionPageToTask(page);
      
      // Denormalize relations
      const enrichedTask = await this.enrichTaskWithRelations(notionTask);
      
      // Save to MongoDB
      const savedTask = await this.saveTaskToMongoDB(enrichedTask);
      
      logger.info(`Successfully mapped task ${pageId}`, {
        taskId: savedTask._id,
        title: savedTask.title
      });

      return {
        success: true,
        entity: savedTask
      };
    } catch (error: any) {
      logger.error(`Failed to map task ${pageId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Map and save a Notion project to MongoDB
   */
  async mapProjectToMongoDB(pageId: string): Promise<MappingResult> {
    try {
      logger.info(`Mapping Notion project ${pageId} to MongoDB`);
      
      // Get Notion page
      const page = await notionService.getProjectById(pageId);
      if (!page) {
        throw new Error(`Project ${pageId} not found in Notion`);
      }

      // Use existing mapper
      const notionProject = notionPageToProject(page);
      
      // Denormalize client info
      const enrichedProject = await this.enrichProjectWithRelations(notionProject);
      
      // Save to MongoDB
      const savedProject = await this.saveProjectToMongoDB(enrichedProject);
      
      logger.info(`Successfully mapped project ${pageId}`, {
        projectId: savedProject._id,
        name: savedProject.name
      });

      return {
        success: true,
        entity: savedProject
      };
    } catch (error: any) {
      logger.error(`Failed to map project ${pageId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Map and save a Notion member to MongoDB
   */
  async mapMemberToMongoDB(pageId: string): Promise<MappingResult> {
    try {
      logger.info(`Mapping Notion member ${pageId} to MongoDB`);
      
      // Get Notion page
      const page = await notionService.getMemberById(pageId);
      if (!page) {
        throw new Error(`Member ${pageId} not found in Notion`);
      }

      // Use existing mapper
      const notionUser = notionPageToUser(page);
      
      // Denormalize team info
      const enrichedMember = await this.enrichMemberWithRelations(notionUser);
      
      // Save to MongoDB
      const savedMember = await this.saveMemberToMongoDB(enrichedMember);
      
      logger.info(`Successfully mapped member ${pageId}`, {
        memberId: savedMember._id,
        name: savedMember.name
      });

      return {
        success: true,
        entity: savedMember
      };
    } catch (error: any) {
      logger.error(`Failed to map member ${pageId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Map and save a Notion team to MongoDB
   */
  async mapTeamToMongoDB(pageId: string): Promise<MappingResult> {
    try {
      logger.info(`Mapping Notion team ${pageId} to MongoDB`);
      
      // Get Notion page
      const page = await notionService.getTeamById(pageId);
      if (!page) {
        throw new Error(`Team ${pageId} not found in Notion`);
      }

      // Use existing mapper
      const notionTeam = notionPageToTeam(page);
      
      // Save to MongoDB (teams are simple, no denormalization needed)
      const savedTeam = await this.saveTeamToMongoDB(notionTeam);
      
      logger.info(`Successfully mapped team ${pageId}`, {
        teamId: savedTeam._id,
        name: savedTeam.name
      });

      return {
        success: true,
        entity: savedTeam
      };
    } catch (error: any) {
      logger.error(`Failed to map team ${pageId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Map and save a Notion client to MongoDB
   */
  async mapClientToMongoDB(pageId: string): Promise<MappingResult> {
    try {
      logger.info(`Mapping Notion client ${pageId} to MongoDB`);
      
      // Get Notion page
      const page = await notionService.getClientById(pageId);
      if (!page) {
        throw new Error(`Client ${pageId} not found in Notion`);
      }

      // Use existing mapper
      const notionClient = notionPageToClient(page);
      
      // Save to MongoDB
      const savedClient = await this.saveClientToMongoDB(notionClient);
      
      logger.info(`Successfully mapped client ${pageId}`, {
        clientId: savedClient._id,
        name: savedClient.name
      });

      return {
        success: true,
        entity: savedClient
      };
    } catch (error: any) {
      logger.error(`Failed to map client ${pageId}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Bulk map multiple entities
   */
  async bulkMapEntities(
    entityType: 'Task' | 'Project' | 'Member' | 'Team' | 'Client',
    pageIds: string[]
  ): Promise<BulkMappingResult> {
    const result: BulkMappingResult = {
      total: pageIds.length,
      success: 0,
      failed: 0,
      errors: []
    };

    logger.info(`Starting bulk mapping for ${pageIds.length} ${entityType} entities`);

    for (const pageId of pageIds) {
      try {
        let mappingResult: MappingResult;
        
        switch (entityType) {
          case 'Task':
            mappingResult = await this.mapTaskToMongoDB(pageId);
            break;
          case 'Project':
            mappingResult = await this.mapProjectToMongoDB(pageId);
            break;
          case 'Member':
            mappingResult = await this.mapMemberToMongoDB(pageId);
            break;
          case 'Team':
            mappingResult = await this.mapTeamToMongoDB(pageId);
            break;
          case 'Client':
            mappingResult = await this.mapClientToMongoDB(pageId);
            break;
        }

        if (mappingResult.success) {
          result.success++;
        } else {
          result.failed++;
          result.errors.push(mappingResult.error || 'Unknown error');
        }
      } catch (error: any) {
        result.failed++;
        result.errors.push(`${pageId}: ${error.message}`);
      }
    }

    logger.info(`Bulk mapping completed`, result);
    return result;
  }

  /**
   * Enrich task with denormalized relation data
   */
  private async enrichTaskWithRelations(notionTask: any): Promise<any> {
    const enriched = { ...notionTask };

    try {
      // Fetch and denormalize project info
      if (notionTask.projectId) {
        const projectPage = await notionService.getProjectById(notionTask.projectId);
        if (projectPage) {
          const project = notionPageToProject(projectPage);
          enriched.projectName = project.name;
          
          // Also fetch client through project
          if (project.client) {
            const clientPage = await notionService.getClientById(project.client);
            if (clientPage) {
              const client = notionPageToClient(clientPage);
              enriched.clientName = client.name;
              enriched.clientId = client.id;
            }
          }
        }
      }

      // Fetch and denormalize assigned members
      if (notionTask.assignedMembers?.length > 0) {
        enriched.assignedMemberNames = [];
        enriched.assignedMemberEmails = [];
        
        for (const memberId of notionTask.assignedMembers) {
          try {
            const memberPage = await notionService.getMemberById(memberId);
            if (memberPage) {
              const member = notionPageToUser(memberPage);
              enriched.assignedMemberNames.push(member.name);
              if (member.email) {
                enriched.assignedMemberEmails.push(member.email);
              }
            }
          } catch (error) {
            logger.warn(`Could not fetch member ${memberId} for task enrichment`);
          }
        }
      }
    } catch (error) {
      logger.error('Error enriching task with relations:', error);
    }

    return enriched;
  }

  /**
   * Enrich project with denormalized relation data
   */
  private async enrichProjectWithRelations(notionProject: any): Promise<any> {
    const enriched = { ...notionProject };

    try {
      // Fetch and denormalize client info
      if (notionProject.client) {
        const clientPage = await notionService.getClientById(notionProject.client);
        if (clientPage) {
          const client = notionPageToClient(clientPage);
          enriched.clientName = client.name;
        }
      }
    } catch (error) {
      logger.error('Error enriching project with relations:', error);
    }

    return enriched;
  }

  /**
   * Enrich member with denormalized relation data
   */
  private async enrichMemberWithRelations(notionUser: any): Promise<any> {
    const enriched = { ...notionUser };

    try {
      // Fetch and denormalize team info
      if (notionUser.team) {
        const teamPage = await notionService.getTeamById(notionUser.team);
        if (teamPage) {
          const team = notionPageToTeam(teamPage);
          enriched.teamName = team.name;
        }
      }
    } catch (error) {
      logger.error('Error enriching member with relations:', error);
    }

    return enriched;
  }

  /**
   * Save task to MongoDB with upsert
   */
  private async saveTaskToMongoDB(taskData: any): Promise<any> {
    const task = await TaskModel.findOneAndUpdate(
      { notionId: taskData.id },
      {
        notionId: taskData.id,
        title: taskData.title,
        workPeriod: taskData.workPeriod,
        assignedMembers: taskData.assignedMembers,
        assignedMemberNames: taskData.assignedMemberNames || [],
        assignedMemberEmails: taskData.assignedMemberEmails || [],
        projectId: taskData.projectId,
        projectName: taskData.projectName,
        clientId: taskData.clientId,
        clientName: taskData.clientName,
        taskType: taskData.taskType,
        status: taskData.status,
        notes: taskData.notes,
        billedHours: taskData.billedHours,
        actualHours: taskData.actualHours,
        addToCalendar: taskData.addToCalendar,
        googleEventId: taskData.googleEventId,
        clientPlanning: taskData.clientPlanning,
        notionLastEditedTime: taskData.updatedAt,
        lastSyncedAt: new Date()
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true
      }
    );

    return task;
  }

  /**
   * Save project to MongoDB with upsert
   */
  private async saveProjectToMongoDB(projectData: any): Promise<any> {
    const project = await ProjectModel.findOneAndUpdate(
      { notionId: projectData.id },
      {
        notionId: projectData.id,
        name: projectData.name,
        clientId: projectData.client,
        clientName: projectData.clientName,
        status: projectData.status,
        taskIds: projectData.tasks || [],
        notionLastEditedTime: new Date(),
        lastSyncedAt: new Date()
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true
      }
    );

    return project;
  }

  /**
   * Save member to MongoDB with upsert
   */
  private async saveMemberToMongoDB(memberData: any): Promise<any> {
    const member = await MemberModel.findOneAndUpdate(
      { notionId: memberData.id },
      {
        notionId: memberData.id,
        name: memberData.name,
        email: memberData.email,
        teamId: memberData.team,
        teamName: memberData.teamName,
        taskIds: memberData.tasks || [],
        notionLastEditedTime: new Date(),
        lastSyncedAt: new Date()
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true
      }
    );

    return member;
  }

  /**
   * Save team to MongoDB with upsert
   */
  private async saveTeamToMongoDB(teamData: any): Promise<any> {
    const team = await TeamModel.findOneAndUpdate(
      { notionId: teamData.id },
      {
        notionId: teamData.id,
        name: teamData.name,
        memberIds: teamData.members || [],
        notionLastEditedTime: new Date(),
        lastSyncedAt: new Date()
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true
      }
    );

    return team;
  }

  /**
   * Save client to MongoDB with upsert
   */
  private async saveClientToMongoDB(clientData: any): Promise<any> {
    const client = await ClientModel.findOneAndUpdate(
      { notionId: clientData.id },
      {
        notionId: clientData.id,
        name: clientData.name,
        projectIds: clientData.projects || [],
        notionLastEditedTime: new Date(),
        lastSyncedAt: new Date()
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true
      }
    );

    return client;
  }

  /**
   * Get mapping statistics
   */
  async getMappingStats(): Promise<any> {
    const stats = await Promise.all([
      TaskModel.countDocuments({ lastSyncedAt: { $exists: true } }),
      ProjectModel.countDocuments({ lastSyncedAt: { $exists: true } }),
      MemberModel.countDocuments({ lastSyncedAt: { $exists: true } }),
      TeamModel.countDocuments({ lastSyncedAt: { $exists: true } }),
      ClientModel.countDocuments({ lastSyncedAt: { $exists: true } }),
      SyncLogModel.find().sort({ startTime: -1 }).limit(100)
    ]);

    return {
      mappedEntities: {
        tasks: stats[0],
        projects: stats[1],
        members: stats[2],
        teams: stats[3],
        clients: stats[4]
      },
      recentSyncs: stats[5]
    };
  }
}

export default new NotionMappingService();