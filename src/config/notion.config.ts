import { Client } from '@notionhq/client';
import dotenv from 'dotenv';

dotenv.config();

export const notion = new Client({
  auth: process.env.NOTION_TOKEN!,
  timeoutMs: 10000,
  baseUrl: 'https://api.notion.com'
});

export const DATABASES = {
  traffic: process.env.NOTION_DB_TRAFFIC!,
  users: process.env.NOTION_DB_USERS!,
  projects: process.env.NOTION_DB_PROJECTS!,
  clients: process.env.NOTION_DB_CLIENTS!,
  teams: process.env.NOTION_DB_TEAMS!
};

export const TASK_PROPERTY_IDS = {
  title: 'title',
  workPeriod: '%40WIV',
  assignedMembers: '%60wMW',
  projectId: 'pE%7Bw',
  taskType: 'Zq%40f',
  status: 'fMMJ',
  notes: 'kszE',
  billedHours: 'wDUP',
  actualHours: 'SmAG',
  addToCalendar: '%3F%3B%5Ce',
  googleEventId: 'Ylnb',
  clientPlanning: '%5C%5Cb%3F',
  client: 'caFD',
  team: 'TJ%7CG'
};

export const USER_PROPERTY_IDS = {
  title: 'title',
  email: 'qiNY',
  team: 'MHDm',
  tasks: '%3F%3D%7CK'
};

export const PROJECT_PROPERTY_IDS = {
  title: 'title',
  client: 'IQQz',
  status: 'E%60o%5B',
  tasks: 'yrmv'
};

export const CLIENT_PROPERTY_IDS = {
  title: 'title',
  projects: 'j%3DET'
};

export const TEAM_PROPERTY_IDS = {
  title: 'title',
  members: 'Ha%3Eo'
};