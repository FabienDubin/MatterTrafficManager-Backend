import {
  NotionTask,
  NotionMember,
  NotionProject,
  NotionClient,
  NotionTeam,
} from '../types/notion.types';
import {
  TASK_PROPERTY_IDS,
  USER_PROPERTY_IDS,
  PROJECT_PROPERTY_IDS,
  CLIENT_PROPERTY_IDS,
  TEAM_PROPERTY_IDS,
} from '../config/notion.config';
import logger from '../config/logger.config';

export function extractTitle(property: any): string {
  if (property?.title?.length > 0) {
    return property.title[0]?.plain_text || '';
  }
  return '';
}

export function extractRichText(property: any): string {
  if (property?.rich_text?.length > 0) {
    return property.rich_text.map((text: any) => text.plain_text).join('');
  }
  return '';
}

export function extractNumber(property: any): number | null {
  return property?.number ?? null;
}

export function extractCheckbox(property: any): boolean {
  return property?.checkbox ?? false;
}

export function extractSelect(property: any): string | null {
  // Handle both select and status property types
  return property?.select?.name ?? property?.status?.name ?? null;
}

/**
 * Map French task type values from Notion to English values used in the backend
 */
export function mapTaskType(notionTaskType: string | null): 'task' | 'holiday' | 'school' | 'remote' | null {
  if (!notionTaskType) return null;
  
  const typeMap: Record<string, 'task' | 'holiday' | 'school' | 'remote'> = {
    // French values from Notion
    'Tâche': 'task',
    'Tache': 'task',
    'Congé': 'holiday',
    'Congés': 'holiday',
    'Formation': 'school',
    'École': 'school',
    'Ecole': 'school',
    'Télétravail': 'remote',
    'Teletravail': 'remote',
    'Remote': 'remote',
    
    // English fallback values
    'task': 'task',
    'holiday': 'holiday',
    'school': 'school',
    'remote': 'remote'
  };
  
  // Case-insensitive lookup
  const normalizedType = notionTaskType.trim();
  const mappedType = typeMap[normalizedType] || 
                     typeMap[normalizedType.toLowerCase()] ||
                     'task'; // Default to 'task' if unknown
  
  // Removed console.log - mapping is working correctly now
  return mappedType;
}

export function extractDate(property: any): { start: Date | null; end: Date | null } {
  if (!property?.date) {
    return { start: null, end: null };
  }

  return {
    start: property.date.start ? new Date(property.date.start) : null,
    end: property.date.end ? new Date(property.date.end) : null,
  };
}

export function extractRelationIds(property: any): string[] {
  if (!property?.relation || !Array.isArray(property.relation)) {
    return [];
  }
  return property.relation.map((rel: any) => rel.id);
}

export function extractRollupRelationIds(property: any): string[] {
  if (!property?.rollup?.array || !Array.isArray(property.rollup.array)) {
    return [];
  }
  
  const ids: string[] = [];
  property.rollup.array.forEach((item: any) => {
    if (item?.relation && Array.isArray(item.relation)) {
      item.relation.forEach((rel: any) => {
        if (rel?.id) ids.push(rel.id);
      });
    }
  });
  
  return ids;
}

export function extractEmail(property: any): string {
  return property?.email || '';
}

export function notionPageToTask(page: any): NotionTask {
  const props = page.properties;
  const dateRange = extractDate(props[TASK_PROPERTY_IDS.workPeriod]);

  // Extract and map task type from French to English
  const rawTaskType = extractSelect(props[TASK_PROPERTY_IDS.taskType]);
  const mappedTaskType = mapTaskType(rawTaskType);

  const task: NotionTask = {
    id: page.id,
    title: extractTitle(props[TASK_PROPERTY_IDS.title]),
    workPeriod: {
      startDate: dateRange.start,
      endDate: dateRange.end,
    },
    assignedMembers: extractRelationIds(props[TASK_PROPERTY_IDS.assignedMembers]),
    projectId: extractRelationIds(props[TASK_PROPERTY_IDS.projectId])[0] || null,
    taskType: mappedTaskType as any,
    status: extractSelect(props[TASK_PROPERTY_IDS.status]) as any,
    notes: extractRichText(props[TASK_PROPERTY_IDS.notes]),
    billedHours: extractNumber(props[TASK_PROPERTY_IDS.billedHours]),
    actualHours: extractNumber(props[TASK_PROPERTY_IDS.actualHours]),
    addToCalendar: extractCheckbox(props[TASK_PROPERTY_IDS.addToCalendar]),
    googleEventId: extractRichText(props[TASK_PROPERTY_IDS.googleEventId]) || null,
    clientPlanning: extractCheckbox(props[TASK_PROPERTY_IDS.clientPlanning]),
    client: extractRichText(props[TASK_PROPERTY_IDS.client]) || null,
    teams: extractRollupRelationIds(props[TASK_PROPERTY_IDS.team]), // Changed to use rollup extractor for teams array
    createdAt: new Date(page.created_time),
    updatedAt: new Date(page.last_edited_time),
  };

  logger.debug('Mapped Notion page to task', {
    taskId: task.id,
    title: task.title,
    assignedCount: task.assignedMembers.length,
  });

  return task;
}

export function notionPageToUser(page: any): NotionMember {
  const props = page.properties;

  return {
    id: page.id,
    name: extractTitle(props[USER_PROPERTY_IDS.title]),
    email: extractEmail(props[USER_PROPERTY_IDS.email]),
    teams: extractRelationIds(props[USER_PROPERTY_IDS.team]), // Changed to return all team IDs
    tasks: extractRelationIds(props[USER_PROPERTY_IDS.tasks]),
  };
}

export function notionPageToProject(page: any): NotionProject {
  const props = page.properties;

  return {
    id: page.id,
    name: extractTitle(props[PROJECT_PROPERTY_IDS.title]),
    client: extractRelationIds(props[PROJECT_PROPERTY_IDS.client])[0] || null,
    status: extractSelect(props[PROJECT_PROPERTY_IDS.status]) || 'not_started',
    tasks: extractRelationIds(props[PROJECT_PROPERTY_IDS.tasks]),
  };
}

export function notionPageToClient(page: any): NotionClient {
  const props = page.properties;

  return {
    id: page.id,
    name: extractTitle(props[CLIENT_PROPERTY_IDS.title]),
    projects: extractRelationIds(props[CLIENT_PROPERTY_IDS.projects]),
  };
}

export function notionPageToTeam(page: any): NotionTeam {
  const props = page.properties;

  return {
    id: page.id,
    name: extractTitle(props[TEAM_PROPERTY_IDS.title]),
    members: extractRelationIds(props[TEAM_PROPERTY_IDS.members]),
  };
}

export function createNotionTaskProperties(input: any) {
  const properties: any = {};

  if (input.title !== undefined) {
    properties[TASK_PROPERTY_IDS.title] = {
      title: [{ text: { content: input.title } }],
    };
  }

  if (input.workPeriod) {
    properties[TASK_PROPERTY_IDS.workPeriod] = {
      date: {
        start: input.workPeriod.startDate,
        end: input.workPeriod.endDate,
      },
    };
  }

  if (input.assignedMembers !== undefined) {
    properties[TASK_PROPERTY_IDS.assignedMembers] = {
      relation: input.assignedMembers.map((id: string) => ({ id })),
    };
  }

  if (input.projectId !== undefined) {
    properties[TASK_PROPERTY_IDS.projectId] = {
      relation: input.projectId ? [{ id: input.projectId }] : [],
    };
  }

  if (input.taskType !== undefined) {
    // Type de tache is a status field in Notion, not select
    // Map our taskType values to the French names used in Notion
    const taskTypeMap: { [key: string]: string } = {
      'task': 'Tache',
      'holiday': 'Congé', 
      'school': 'Formation',
      'remote': 'Télétravail'
    };
    properties[TASK_PROPERTY_IDS.taskType] = {
      status: { name: taskTypeMap[input.taskType] || 'Tache' },
    };
  }

  if (input.status !== undefined) {
    // État is a status field in Notion, not select
    // Map our status values to the French names used in Notion
    const statusMap: { [key: string]: string } = {
      'not_started': 'Pas commencé',
      'in_progress': 'A valider',
      'completed': 'Terminé'
    };
    properties[TASK_PROPERTY_IDS.status] = {
      status: { name: statusMap[input.status] || 'Pas commencé' },
    };
  }

  if (input.notes !== undefined) {
    properties[TASK_PROPERTY_IDS.notes] = {
      rich_text: [{ text: { content: input.notes } }],
    };
  }

  if (input.billedHours !== undefined) {
    properties[TASK_PROPERTY_IDS.billedHours] = {
      number: input.billedHours,
    };
  }

  if (input.actualHours !== undefined) {
    properties[TASK_PROPERTY_IDS.actualHours] = {
      number: input.actualHours,
    };
  }

  if (input.addToCalendar !== undefined) {
    properties[TASK_PROPERTY_IDS.addToCalendar] = {
      checkbox: input.addToCalendar,
    };
  }

  if (input.clientPlanning !== undefined) {
    properties[TASK_PROPERTY_IDS.clientPlanning] = {
      checkbox: input.clientPlanning,
    };
  }

  return properties;
}
