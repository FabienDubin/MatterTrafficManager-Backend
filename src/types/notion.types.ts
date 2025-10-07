export interface NotionTask {
  id: string;
  title: string;
  workPeriod: {
    startDate: Date | null;
    endDate: Date | null;
  };
  assignedMembers: string[];
  projectId: string | null;
  taskType: 'task' | 'holiday' | 'school' | 'remote' | null;
  status: 'not_started' | 'in_progress' | 'completed' | null;
  notes: string;
  billedHours: number | null;
  actualHours: number | null;
  addToCalendar: boolean;
  googleEventId: string | null;
  clientPlanning: boolean;
  client: string | null;
  teams: string[]; // Changed from team: string | null to support multiple teams from rollup
  isAllDay?: boolean; // Flag pour indiquer si c'est une tâche journée entière
  shouldSplitDaily?: boolean; // Flag pour indiquer si une tâche multi-jours doit être splittée en badges quotidiens
  notionUrl?: string | null; // URL de la page Notion
  createdAt: Date;
  updatedAt: Date;
}

export interface NotionMember {
  id: string;
  name: string;
  email: string;
  teams: string[]; // Changed from team: string | null to support multiple teams
  tasks: string[];
}

export interface NotionProject {
  id: string;
  name: string;
  client: string | null;
  status: string;
  tasks: string[];
}

export interface NotionClient {
  id: string;
  name: string;
  projects: string[];
}

export interface NotionTeam {
  id: string;
  name: string;
  members: string[];
}

export interface DatabaseQueryResult<T> {
  results: T[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount?: number;
}

export interface SyncResult {
  synced: number;
  conflicts: number;
  errors: string[];
}

export interface NotionErrorDetails {
  code: string;
  message: string;
  status: number;
  retryAfter?: number;
}

export interface CreateTaskInput {
  title: string;
  workPeriod: {
    startDate: string;
    endDate: string;
  };
  assignedMembers?: string[];
  projectId?: string;
  taskType?: 'task' | 'holiday' | 'school' | 'remote';
  status?: 'not_started' | 'in_progress' | 'completed';
  notes?: string;
  billedHours?: number;
  actualHours?: number;
  addToCalendar?: boolean;
  clientPlanning?: boolean;
}

export interface UpdateTaskInput {
  title?: string;
  workPeriod?: {
    startDate?: string;
    endDate?: string;
  };
  assignedMembers?: string[];
  projectId?: string;
  taskType?: 'task' | 'holiday' | 'school' | 'remote';
  status?: 'not_started' | 'in_progress' | 'completed';
  notes?: string;
  billedHours?: number;
  actualHours?: number;
  addToCalendar?: boolean;
  clientPlanning?: boolean;
}
