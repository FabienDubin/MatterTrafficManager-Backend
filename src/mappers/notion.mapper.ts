import {
  NotionTask,
  NotionUser,
  NotionProject,
  NotionClient,
  NotionTeam
} from '../types/notion.types';
import {
  TASK_PROPERTY_IDS,
  USER_PROPERTY_IDS,
  PROJECT_PROPERTY_IDS,
  CLIENT_PROPERTY_IDS,
  TEAM_PROPERTY_IDS
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
  return property?.select?.name ?? null;
}

export function extractDate(property: any): { start: Date | null; end: Date | null } {
  if (!property?.date) {
    return { start: null, end: null };
  }
  
  return {
    start: property.date.start ? new Date(property.date.start) : null,
    end: property.date.end ? new Date(property.date.end) : null
  };
}

export function extractRelationIds(property: any): string[] {
  if (!property?.relation || !Array.isArray(property.relation)) {
    return [];
  }
  return property.relation.map((rel: any) => rel.id);
}

export function extractEmail(property: any): string {
  return property?.email || '';
}

export function notionPageToTask(page: any): NotionTask {
  const props = page.properties;
  const dateRange = extractDate(props[TASK_PROPERTY_IDS.workPeriod]);
  
  const task: NotionTask = {
    id: page.id,
    title: extractTitle(props[TASK_PROPERTY_IDS.title]),
    workPeriod: {
      startDate: dateRange.start,
      endDate: dateRange.end
    },
    assignedMembers: extractRelationIds(props[TASK_PROPERTY_IDS.assignedMembers]),
    projectId: extractRelationIds(props[TASK_PROPERTY_IDS.projectId])[0] || null,
    taskType: extractSelect(props[TASK_PROPERTY_IDS.taskType]) as any,
    status: extractSelect(props[TASK_PROPERTY_IDS.status]) as any,
    notes: extractRichText(props[TASK_PROPERTY_IDS.notes]),
    billedHours: extractNumber(props[TASK_PROPERTY_IDS.billedHours]),
    actualHours: extractNumber(props[TASK_PROPERTY_IDS.actualHours]),
    addToCalendar: extractCheckbox(props[TASK_PROPERTY_IDS.addToCalendar]),
    googleEventId: extractRichText(props[TASK_PROPERTY_IDS.googleEventId]) || null,
    clientPlanning: extractCheckbox(props[TASK_PROPERTY_IDS.clientPlanning]),
    client: extractRichText(props[TASK_PROPERTY_IDS.client]) || null,
    team: extractRichText(props[TASK_PROPERTY_IDS.team]) || null,
    createdAt: new Date(page.created_time),
    updatedAt: new Date(page.last_edited_time)
  };

  logger.debug('Mapped Notion page to task', { 
    taskId: task.id, 
    title: task.title,
    assignedCount: task.assignedMembers.length 
  });

  return task;
}

export function notionPageToUser(page: any): NotionUser {
  const props = page.properties;
  
  return {
    id: page.id,
    name: extractTitle(props[USER_PROPERTY_IDS.title]),
    email: extractEmail(props[USER_PROPERTY_IDS.email]),
    team: extractRelationIds(props[USER_PROPERTY_IDS.team])[0] || null,
    tasks: extractRelationIds(props[USER_PROPERTY_IDS.tasks])
  };
}

export function notionPageToProject(page: any): NotionProject {
  const props = page.properties;
  
  return {
    id: page.id,
    name: extractTitle(props[PROJECT_PROPERTY_IDS.title]),
    client: extractRelationIds(props[PROJECT_PROPERTY_IDS.client])[0] || null,
    status: extractSelect(props[PROJECT_PROPERTY_IDS.status]) || 'not_started',
    tasks: extractRelationIds(props[PROJECT_PROPERTY_IDS.tasks])
  };
}

export function notionPageToClient(page: any): NotionClient {
  const props = page.properties;
  
  return {
    id: page.id,
    name: extractTitle(props[CLIENT_PROPERTY_IDS.title]),
    projects: extractRelationIds(props[CLIENT_PROPERTY_IDS.projects])
  };
}

export function notionPageToTeam(page: any): NotionTeam {
  const props = page.properties;
  
  return {
    id: page.id,
    name: extractTitle(props[TEAM_PROPERTY_IDS.title]),
    members: extractRelationIds(props[TEAM_PROPERTY_IDS.members])
  };
}

export function createNotionTaskProperties(input: any) {
  const properties: any = {};

  if (input.title !== undefined) {
    properties[TASK_PROPERTY_IDS.title] = {
      title: [{ text: { content: input.title } }]
    };
  }

  if (input.workPeriod) {
    properties[TASK_PROPERTY_IDS.workPeriod] = {
      date: {
        start: input.workPeriod.startDate,
        end: input.workPeriod.endDate
      }
    };
  }

  if (input.assignedMembers !== undefined) {
    properties[TASK_PROPERTY_IDS.assignedMembers] = {
      relation: input.assignedMembers.map((id: string) => ({ id }))
    };
  }

  if (input.projectId !== undefined) {
    properties[TASK_PROPERTY_IDS.projectId] = {
      relation: input.projectId ? [{ id: input.projectId }] : []
    };
  }

  if (input.taskType !== undefined) {
    properties[TASK_PROPERTY_IDS.taskType] = {
      select: { name: input.taskType }
    };
  }

  if (input.status !== undefined) {
    properties[TASK_PROPERTY_IDS.status] = {
      select: { name: input.status }
    };
  }

  if (input.notes !== undefined) {
    properties[TASK_PROPERTY_IDS.notes] = {
      rich_text: [{ text: { content: input.notes } }]
    };
  }

  if (input.billedHours !== undefined) {
    properties[TASK_PROPERTY_IDS.billedHours] = {
      number: input.billedHours
    };
  }

  if (input.actualHours !== undefined) {
    properties[TASK_PROPERTY_IDS.actualHours] = {
      number: input.actualHours
    };
  }

  if (input.addToCalendar !== undefined) {
    properties[TASK_PROPERTY_IDS.addToCalendar] = {
      checkbox: input.addToCalendar
    };
  }

  if (input.clientPlanning !== undefined) {
    properties[TASK_PROPERTY_IDS.clientPlanning] = {
      checkbox: input.clientPlanning
    };
  }

  return properties;
}