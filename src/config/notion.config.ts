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
  title: 'Nom de tâche',
  workPeriod: 'Période de travail',
  assignedMembers: 'Utilisateurs',
  projectId: '📁 Projets',
  taskType: 'Type de tache',
  status: 'État',
  notes: 'Commentaire',
  billedHours: 'Nombre de heures facturés',
  actualHours: 'Nombre de heures effectives',
  addToCalendar: 'Ajouter au Calendrier',
  googleEventId: 'Google Event ID',
  clientPlanning: 'Ajouter au rétroplanning client',
  client: 'Client',
  team: 'Équipe'
};

export const USER_PROPERTY_IDS = {
  title: 'Nom',
  email: 'Email',
  team: 'Équipe',
  tasks: '✅ Tâches'
};

export const PROJECT_PROPERTY_IDS = {
  title: 'Nom',
  client: 'Client',
  status: 'Statut du projet',
  tasks: 'Tâches'
};

export const CLIENT_PROPERTY_IDS = {
  title: 'Nom du client',
  projects: '📁 Projets'
};

export const TEAM_PROPERTY_IDS = {
  title: 'Nom',
  members: 'Utilisateurs'
};