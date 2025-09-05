import {
  extractTitle,
  extractRichText,
  extractNumber,
  extractCheckbox,
  extractSelect,
  extractDate,
  extractRelationIds,
  extractEmail,
  notionPageToTask,
  notionPageToUser,
  notionPageToProject,
  notionPageToClient,
  notionPageToTeam,
  createNotionTaskProperties
} from '../../../src/mappers/notion.mapper';

jest.mock('../../../src/config/logger.config', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('NotionMapper', () => {
  describe('extractTitle', () => {
    it('should extract title from property', () => {
      const property = {
        title: [{ plain_text: 'Test Title' }]
      };
      expect(extractTitle(property)).toBe('Test Title');
    });

    it('should return empty string for empty title', () => {
      expect(extractTitle({})).toBe('');
      expect(extractTitle({ title: [] })).toBe('');
      expect(extractTitle(null)).toBe('');
    });
  });

  describe('extractRichText', () => {
    it('should extract rich text from property', () => {
      const property = {
        rich_text: [
          { plain_text: 'Part 1 ' },
          { plain_text: 'Part 2' }
        ]
      };
      expect(extractRichText(property)).toBe('Part 1 Part 2');
    });

    it('should return empty string for empty rich text', () => {
      expect(extractRichText({})).toBe('');
      expect(extractRichText({ rich_text: [] })).toBe('');
    });
  });

  describe('extractNumber', () => {
    it('should extract number from property', () => {
      expect(extractNumber({ number: 42 })).toBe(42);
      expect(extractNumber({ number: 0 })).toBe(0);
    });

    it('should return null for missing number', () => {
      expect(extractNumber({})).toBeNull();
      expect(extractNumber({ number: null })).toBeNull();
    });
  });

  describe('extractCheckbox', () => {
    it('should extract checkbox value', () => {
      expect(extractCheckbox({ checkbox: true })).toBe(true);
      expect(extractCheckbox({ checkbox: false })).toBe(false);
    });

    it('should return false for missing checkbox', () => {
      expect(extractCheckbox({})).toBe(false);
      expect(extractCheckbox(null)).toBe(false);
    });
  });

  describe('extractSelect', () => {
    it('should extract select value', () => {
      const property = { select: { name: 'Option 1' } };
      expect(extractSelect(property)).toBe('Option 1');
    });

    it('should return null for missing select', () => {
      expect(extractSelect({})).toBeNull();
      expect(extractSelect({ select: null })).toBeNull();
    });
  });

  describe('extractDate', () => {
    it('should extract date range', () => {
      const property = {
        date: {
          start: '2024-01-01',
          end: '2024-01-02'
        }
      };
      const result = extractDate(property);
      
      expect(result.start).toEqual(new Date('2024-01-01'));
      expect(result.end).toEqual(new Date('2024-01-02'));
    });

    it('should handle single date', () => {
      const property = {
        date: {
          start: '2024-01-01'
        }
      };
      const result = extractDate(property);
      
      expect(result.start).toEqual(new Date('2024-01-01'));
      expect(result.end).toBeNull();
    });

    it('should return null dates for missing property', () => {
      const result = extractDate({});
      expect(result.start).toBeNull();
      expect(result.end).toBeNull();
    });
  });

  describe('extractRelationIds', () => {
    it('should extract relation IDs', () => {
      const property = {
        relation: [
          { id: 'id1' },
          { id: 'id2' }
        ]
      };
      expect(extractRelationIds(property)).toEqual(['id1', 'id2']);
    });

    it('should return empty array for missing relations', () => {
      expect(extractRelationIds({})).toEqual([]);
      expect(extractRelationIds({ relation: null })).toEqual([]);
      expect(extractRelationIds({ relation: [] })).toEqual([]);
    });
  });

  describe('extractEmail', () => {
    it('should extract email', () => {
      expect(extractEmail({ email: 'test@example.com' })).toBe('test@example.com');
    });

    it('should return empty string for missing email', () => {
      expect(extractEmail({})).toBe('');
      expect(extractEmail({ email: null })).toBe('');
    });
  });

  describe('notionPageToTask', () => {
    it('should convert Notion page to task', () => {
      const page = {
        id: 'task123',
        properties: {
          title: { title: [{ plain_text: 'Test Task' }] },
          '%40WIV': { date: { start: '2024-01-01', end: '2024-01-02' } },
          '%60wMW': { relation: [{ id: 'user1' }] },
          'pE%7Bw': { relation: [{ id: 'project1' }] },
          'Zq%40f': { select: { name: 'task' } },
          'fMMJ': { select: { name: 'in_progress' } },
          'kszE': { rich_text: [{ plain_text: 'Notes' }] },
          'wDUP': { number: 8 },
          'SmAG': { number: 4 },
          '%3F%3B%5Ce': { checkbox: true },
          'Ylnb': { rich_text: [{ plain_text: 'event123' }] },
          '%5C%5Cb%3F': { checkbox: false },
          'caFD': { rich_text: [{ plain_text: 'Client A' }] },
          'TJ%7CG': { rich_text: [{ plain_text: 'Team B' }] }
        },
        created_time: '2024-01-01T00:00:00Z',
        last_edited_time: '2024-01-02T00:00:00Z'
      };

      const task = notionPageToTask(page);

      expect(task.id).toBe('task123');
      expect(task.title).toBe('Test Task');
      expect(task.workPeriod.startDate).toEqual(new Date('2024-01-01'));
      expect(task.workPeriod.endDate).toEqual(new Date('2024-01-02'));
      expect(task.assignedMembers).toEqual(['user1']);
      expect(task.projectId).toBe('project1');
      expect(task.taskType).toBe('task');
      expect(task.status).toBe('in_progress');
      expect(task.notes).toBe('Notes');
      expect(task.billedHours).toBe(8);
      expect(task.actualHours).toBe(4);
      expect(task.addToCalendar).toBe(true);
      expect(task.googleEventId).toBe('event123');
      expect(task.clientPlanning).toBe(false);
      expect(task.client).toBe('Client A');
      expect(task.team).toBe('Team B');
    });
  });

  describe('notionPageToUser', () => {
    it('should convert Notion page to user', () => {
      const page = {
        id: 'user123',
        properties: {
          title: { title: [{ plain_text: 'John Doe' }] },
          'qiNY': { email: 'john@example.com' },
          'MHDm': { relation: [{ id: 'team1' }] },
          '%3F%3D%7CK': { relation: [{ id: 'task1' }, { id: 'task2' }] }
        }
      };

      const user = notionPageToUser(page);

      expect(user.id).toBe('user123');
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
      expect(user.team).toBe('team1');
      expect(user.tasks).toEqual(['task1', 'task2']);
    });
  });

  describe('notionPageToProject', () => {
    it('should convert Notion page to project', () => {
      const page = {
        id: 'project123',
        properties: {
          title: { title: [{ plain_text: 'Project Alpha' }] },
          'IQQz': { relation: [{ id: 'client1' }] },
          'E%60o%5B': { select: { name: 'En cours' } },
          'yrmv': { relation: [{ id: 'task1' }] }
        }
      };

      const project = notionPageToProject(page);

      expect(project.id).toBe('project123');
      expect(project.name).toBe('Project Alpha');
      expect(project.client).toBe('client1');
      expect(project.status).toBe('En cours');
      expect(project.tasks).toEqual(['task1']);
    });
  });

  describe('notionPageToClient', () => {
    it('should convert Notion page to client', () => {
      const page = {
        id: 'client123',
        properties: {
          title: { title: [{ plain_text: 'Client Corp' }] },
          'j%3DET': { relation: [{ id: 'project1' }, { id: 'project2' }] }
        }
      };

      const client = notionPageToClient(page);

      expect(client.id).toBe('client123');
      expect(client.name).toBe('Client Corp');
      expect(client.projects).toEqual(['project1', 'project2']);
    });
  });

  describe('notionPageToTeam', () => {
    it('should convert Notion page to team', () => {
      const page = {
        id: 'team123',
        properties: {
          title: { title: [{ plain_text: 'Development Team' }] },
          'Ha%3Eo': { relation: [{ id: 'user1' }, { id: 'user2' }] }
        }
      };

      const team = notionPageToTeam(page);

      expect(team.id).toBe('team123');
      expect(team.name).toBe('Development Team');
      expect(team.members).toEqual(['user1', 'user2']);
    });
  });

  describe('createNotionTaskProperties', () => {
    it('should create Notion properties from task input', () => {
      const input = {
        title: 'New Task',
        workPeriod: {
          startDate: '2024-01-01',
          endDate: '2024-01-02'
        },
        assignedMembers: ['user1', 'user2'],
        projectId: 'project1',
        taskType: 'task' as const,
        status: 'not_started' as const,
        notes: 'Task notes',
        billedHours: 8,
        actualHours: 4,
        addToCalendar: true,
        clientPlanning: false
      };

      const properties = createNotionTaskProperties(input);

      expect(properties.title).toEqual({
        title: [{ text: { content: 'New Task' } }]
      });
      expect(properties['%40WIV']).toEqual({
        date: {
          start: '2024-01-01',
          end: '2024-01-02'
        }
      });
      expect(properties['%60wMW']).toEqual({
        relation: [{ id: 'user1' }, { id: 'user2' }]
      });
      expect(properties['pE%7Bw']).toEqual({
        relation: [{ id: 'project1' }]
      });
      expect(properties['Zq%40f']).toEqual({
        select: { name: 'task' }
      });
      expect(properties['fMMJ']).toEqual({
        select: { name: 'not_started' }
      });
      expect(properties['kszE']).toEqual({
        rich_text: [{ text: { content: 'Task notes' } }]
      });
      expect(properties['wDUP']).toEqual({ number: 8 });
      expect(properties['SmAG']).toEqual({ number: 4 });
      expect(properties['%3F%3B%5Ce']).toEqual({ checkbox: true });
      expect(properties['%5C%5Cb%3F']).toEqual({ checkbox: false });
    });

    it('should handle partial input', () => {
      const input = {
        title: 'Minimal Task'
      };

      const properties = createNotionTaskProperties(input);

      expect(properties.title).toEqual({
        title: [{ text: { content: 'Minimal Task' } }]
      });
      expect(Object.keys(properties)).toHaveLength(1);
    });

    it('should handle empty relations', () => {
      const input = {
        assignedMembers: [],
        projectId: ''
      };

      const properties = createNotionTaskProperties(input);

      expect(properties['%60wMW']).toEqual({ relation: [] });
      expect(properties['pE%7Bw']).toEqual({ relation: [] });
    });
  });
});