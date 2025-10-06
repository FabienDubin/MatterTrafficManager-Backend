import DataLoader from 'dataloader';
import { RedisService } from './redis.service';
import {
  NotionMember,
  NotionProject,
  NotionClient,
  NotionTeam,
  NotionTask,
} from '../types/notion.types';
import logger from '../config/logger.config';

export class BatchResolverService {
  private memberLoader: DataLoader<string, NotionMember | null>;
  private projectLoader: DataLoader<string, NotionProject | null>;
  private clientLoader: DataLoader<string, NotionClient | null>;
  private teamLoader: DataLoader<string, NotionTeam | null>;
  private taskLoader: DataLoader<string, NotionTask | null>;

  constructor(
    private redisService: RedisService,
    private notionService: any // NotionService instance
  ) {
    this.memberLoader = this.createMemberLoader();
    this.projectLoader = this.createProjectLoader();
    this.clientLoader = this.createClientLoader();
    this.teamLoader = this.createTeamLoader();
    this.taskLoader = this.createTaskLoader();
  }

  private createMemberLoader(): DataLoader<string, NotionMember | null> {
    return new DataLoader(async (ids: readonly string[]) => {
      logger.info(`BatchResolver: Loading ${ids.length} members`);
      const startTime = performance.now();

      try {
        // 1. Vérifier le cache Redis pour chaque ID
        const cached = await Promise.all(
          ids.map(id => this.redisService.get<NotionMember>(`user:${id}`))
        );

        // 2. Identifier les IDs manquants
        const missingIds = ids.filter((id, index) => !cached[index]);

        // 3. Si des IDs manquent, requête batch Notion
        let freshData: NotionMember[] = [];
        if (missingIds.length > 0) {
          logger.info(`BatchResolver: Fetching ${missingIds.length} members from Notion`);

          // Utiliser la méthode getAllMembers du NotionService avec des IDs spécifiques
          const allMembers = await this.notionService.getAllMembers();
          freshData = allMembers.filter((member: NotionMember) => missingIds.includes(member.id));

          // 4. Mettre à jour Redis avec les nouvelles données
          await Promise.all(
            freshData.map(user => this.redisService.set(`user:${user.id}`, user, 'members'))
          );
        }

        // 5. Combiner cached + fresh data et retourner dans l'ordre correct
        const userMap = new Map<string, NotionMember>();
        cached.forEach((user, index) => {
          const id = ids[index];
          if (user && id) userMap.set(id, user);
        });
        freshData.forEach(user => {
          userMap.set(user.id, user);
        });

        const duration = performance.now() - startTime;
        logger.info(`BatchResolver: Loaded ${ids.length} members in ${duration.toFixed(2)}ms`);

        return ids.map(id => userMap.get(id) || null);
      } catch (error) {
        logger.error('BatchResolver: Error loading members', error);
        return ids.map(() => null);
      }
    });
  }

  private createProjectLoader(): DataLoader<string, NotionProject | null> {
    return new DataLoader(async (ids: readonly string[]) => {
      logger.info(`BatchResolver: Loading ${ids.length} projects`);
      const startTime = performance.now();

      try {
        const cached = await Promise.all(
          ids.map(id => this.redisService.get<NotionProject>(`project:${id}`))
        );

        const missingIds = ids.filter((id, index) => !cached[index]);

        let freshData: NotionProject[] = [];
        if (missingIds.length > 0) {
          logger.info(`BatchResolver: Fetching ${missingIds.length} projects from Notion`);

          const allProjects = await this.notionService.getAllProjects();
          freshData = allProjects.filter((project: NotionProject) =>
            missingIds.includes(project.id)
          );

          await Promise.all(
            freshData.map(project =>
              this.redisService.set(`project:${project.id}`, project, 'projects')
            )
          );
        }

        const projectMap = new Map<string, NotionProject>();
        cached.forEach((project, index) => {
          const id = ids[index];
          if (project && id) projectMap.set(id, project);
        });
        freshData.forEach(project => {
          projectMap.set(project.id, project);
        });

        const duration = performance.now() - startTime;
        logger.info(`BatchResolver: Loaded ${ids.length} projects in ${duration.toFixed(2)}ms`);

        return ids.map(id => projectMap.get(id) || null);
      } catch (error) {
        logger.error('BatchResolver: Error loading projects', error);
        return ids.map(() => null);
      }
    });
  }

  private createClientLoader(): DataLoader<string, NotionClient | null> {
    return new DataLoader(async (ids: readonly string[]) => {
      logger.info(`BatchResolver: Loading ${ids.length} clients`);
      const startTime = performance.now();

      try {
        const cached = await Promise.all(
          ids.map(id => this.redisService.get<NotionClient>(`client:${id}`))
        );

        const missingIds = ids.filter((id, index) => !cached[index]);

        let freshData: NotionClient[] = [];
        if (missingIds.length > 0) {
          logger.info(`BatchResolver: Fetching ${missingIds.length} clients from Notion`);

          const allClients = await this.notionService.getAllClients();
          freshData = allClients.filter((client: NotionClient) => missingIds.includes(client.id));

          await Promise.all(
            freshData.map(client => this.redisService.set(`client:${client.id}`, client, 'clients'))
          );
        }

        const clientMap = new Map<string, NotionClient>();
        cached.forEach((client, index) => {
          const id = ids[index];
          if (client && id) clientMap.set(id, client);
        });
        freshData.forEach(client => {
          clientMap.set(client.id, client);
        });

        const duration = performance.now() - startTime;
        logger.info(`BatchResolver: Loaded ${ids.length} clients in ${duration.toFixed(2)}ms`);

        return ids.map(id => clientMap.get(id) || null);
      } catch (error) {
        logger.error('BatchResolver: Error loading clients', error);
        return ids.map(() => null);
      }
    });
  }

  private createTeamLoader(): DataLoader<string, NotionTeam | null> {
    return new DataLoader(async (ids: readonly string[]) => {
      logger.info(`BatchResolver: Loading ${ids.length} teams`);
      const startTime = performance.now();

      try {
        const cached = await Promise.all(
          ids.map(id => this.redisService.get<NotionTeam>(`team:${id}`))
        );

        const missingIds = ids.filter((id, index) => !cached[index]);

        let freshData: NotionTeam[] = [];
        if (missingIds.length > 0) {
          logger.info(`BatchResolver: Fetching ${missingIds.length} teams from Notion`);

          const allTeams = await this.notionService.getAllTeams();
          freshData = allTeams.filter((team: NotionTeam) => missingIds.includes(team.id));

          await Promise.all(
            freshData.map(team => this.redisService.set(`team:${team.id}`, team, 'teams'))
          );
        }

        const teamMap = new Map<string, NotionTeam>();
        cached.forEach((team, index) => {
          const id = ids[index];
          if (team && id) teamMap.set(id, team);
        });
        freshData.forEach(team => {
          teamMap.set(team.id, team);
        });

        const duration = performance.now() - startTime;
        logger.info(`BatchResolver: Loaded ${ids.length} teams in ${duration.toFixed(2)}ms`);

        return ids.map(id => teamMap.get(id) || null);
      } catch (error) {
        logger.error('BatchResolver: Error loading teams', error);
        return ids.map(() => null);
      }
    });
  }

  private createTaskLoader(): DataLoader<string, NotionTask | null> {
    return new DataLoader(async (ids: readonly string[]) => {
      logger.info(`BatchResolver: Loading ${ids.length} tasks`);
      const startTime = performance.now();

      try {
        const cached = await Promise.all(
          ids.map(id => this.redisService.get<NotionTask>(`task:${id}`))
        );

        const missingIds = ids.filter((id, index) => !cached[index]);

        let freshData: NotionTask[] = [];
        if (missingIds.length > 0) {
          logger.info(`BatchResolver: Fetching ${missingIds.length} tasks from Notion`);

          // Pour les tasks, on peut optimiser en faisant une requête batch
          // Mais pour l'instant on utilise getAllTrafficTasks qui charge tout
          const allTasks = await this.notionService.getAllTrafficTasks();
          freshData = allTasks.filter((task: NotionTask) => missingIds.includes(task.id));

          await Promise.all(
            freshData.map(task => this.redisService.set(`task:${task.id}`, task, 'tasks'))
          );
        }

        const taskMap = new Map<string, NotionTask>();
        cached.forEach((task, index) => {
          const id = ids[index];
          if (task && id) taskMap.set(id, task);
        });
        freshData.forEach(task => {
          taskMap.set(task.id, task);
        });

        const duration = performance.now() - startTime;
        logger.info(`BatchResolver: Loaded ${ids.length} tasks in ${duration.toFixed(2)}ms`);

        return ids.map(id => taskMap.get(id) || null);
      } catch (error) {
        logger.error('BatchResolver: Error loading tasks', error);
        return ids.map(() => null);
      }
    });
  }

  // Méthodes publiques pour charger des données
  async loadMember(id: string): Promise<NotionMember | null> {
    return this.memberLoader.load(id);
  }

  async loadMembers(ids: string[]): Promise<(NotionMember | null)[]> {
    const results = await this.memberLoader.loadMany(ids);
    return results.map(result => (result instanceof Error ? null : result));
  }

  async loadProject(id: string): Promise<NotionProject | null> {
    return this.projectLoader.load(id);
  }

  async loadProjects(ids: string[]): Promise<(NotionProject | null)[]> {
    const results = await this.projectLoader.loadMany(ids);
    return results.map(result => (result instanceof Error ? null : result));
  }

  async loadClient(id: string): Promise<NotionClient | null> {
    return this.clientLoader.load(id);
  }

  async loadClients(ids: string[]): Promise<(NotionClient | null)[]> {
    const results = await this.clientLoader.loadMany(ids);
    return results.map(result => (result instanceof Error ? null : result));
  }

  async loadTeam(id: string): Promise<NotionTeam | null> {
    return this.teamLoader.load(id);
  }

  async loadTeams(ids: string[]): Promise<(NotionTeam | null)[]> {
    const results = await this.teamLoader.loadMany(ids);
    return results.map(result => (result instanceof Error ? null : result));
  }

  async loadTask(id: string): Promise<NotionTask | null> {
    return this.taskLoader.load(id);
  }

  async loadTasks(ids: string[]): Promise<(NotionTask | null)[]> {
    const results = await this.taskLoader.loadMany(ids);
    return results.map(result => (result instanceof Error ? null : result));
  }

  // Méthode principale pour résoudre toutes les relations d'un coup
  async batchResolveRelations(data: {
    tasks?: NotionTask[];
    projects?: NotionProject[];
    teams?: NotionTeam[];
  }): Promise<{
    resolvedTasks: any[];
    resolvedProjects: any[];
    resolvedTeams: any[];
    stats: {
      totalQueries: number;
      cachedHits: number;
      notionFetches: number;
    };
  }> {
    const startTime = performance.now();

    // Collecter tous les IDs uniques à résoudre
    const memberIds = new Set<string>();
    const projectIds = new Set<string>();
    const clientIds = new Set<string>();
    const teamIds = new Set<string>();

    // Extraire les IDs depuis les tasks
    data.tasks?.forEach(task => {
      task.assignedMembers?.forEach(id => memberIds.add(id));
      if (task.projectId) projectIds.add(task.projectId);
      // Note: task.client is a name (from rollup), not an ID - will get clientId from project
      if (task.teams && task.teams.length > 0) {
        task.teams.forEach(teamId => teamIds.add(teamId));
      }
    });

    // Extraire les IDs depuis les projects
    data.projects?.forEach(project => {
      if (project.client) clientIds.add(project.client);
    });
    
    // Ajouter les clientIds depuis les tasks qui ont un projectId
    // On doit d'abord charger les projets pour obtenir leurs clientIds
    const taskProjectIds = data.tasks
      ?.filter(task => task.projectId)
      .map(task => task.projectId as string) || [];

    // Extraire les IDs depuis les teams
    data.teams?.forEach(team => {
      team.members?.forEach(id => memberIds.add(id));
    });

    // Charger d'abord les membres pour obtenir leurs équipes
    const membersPreload = memberIds.size > 0 ? await this.loadMembers(Array.from(memberIds)) : [];
    
    // Collecter les IDs d'équipes depuis les membres
    membersPreload.forEach(member => {
      if (member?.teams) {
        member.teams.forEach(teamId => teamIds.add(teamId));
      }
    });

    // Charger toutes les données en parallèle (batch automatique grâce à DataLoader)
    const [members, projects, teams] = await Promise.all([
      Promise.resolve(membersPreload), // Déjà chargé
      projectIds.size > 0 ? this.loadProjects(Array.from(projectIds)) : [],
      teamIds.size > 0 ? this.loadTeams(Array.from(teamIds)) : [],
    ]);
    
    // Maintenant qu'on a les projets, on peut extraire les clientIds
    projects.forEach(project => {
      if (project?.client) {
        clientIds.add(project.client);
      }
    });
    
    // Charger les clients après avoir collecté tous les IDs
    const clients = clientIds.size > 0 ? await this.loadClients(Array.from(clientIds)) : [];

    // Créer des maps pour un accès rapide
    const memberMap = new Map(members.filter(m => m !== null).map(m => [m!.id, m]));
    const projectMap = new Map(projects.filter(p => p !== null).map(p => [p!.id, p]));
    const clientMap = new Map(clients.filter(c => c !== null).map(c => [c!.id, c]));
    const teamMap = new Map(teams.filter(t => t !== null).map(t => [t!.id, t]));

    // Résoudre les relations et extraire les équipes impliquées
    const resolvedTasks =
      data.tasks?.map(task => {
        // Filter and map assigned members, ensuring we have valid member objects
        const assignedMembersData = (task.assignedMembers || [])
          .map(id => memberMap.get(id))
          .filter(Boolean)
          .map(member => ({
            ...member!,
            id: String(member!.id), // Ensure ID is a string
          }));

        // Extraire toutes les équipes des membres assignés
        const involvedTeamIds = new Set<string>();
        assignedMembersData.forEach(member => {
          if (member?.teams) {
            member.teams.forEach(teamId => {
              if (teamId && typeof teamId === 'string') {
                involvedTeamIds.add(teamId);
              }
            });
          }
        });

        // Ajouter les équipes de la task si elles existent
        if (task.teams && task.teams.length > 0) {
          task.teams.forEach(teamId => {
            if (teamId && typeof teamId === 'string') {
              involvedTeamIds.add(teamId);
            }
          });
        }

        // Récupérer les données des équipes impliquées
        const involvedTeamsData = Array.from(involvedTeamIds)
          .map(teamId => teamMap.get(teamId))
          .filter(Boolean)
          .map(team => ({
            ...team!,
            id: String(team!.id), // Ensure ID is a string
          }));

        // Obtenir le clientId depuis le projet
        const projectData = task.projectId ? projectMap.get(task.projectId) : null;
        const clientId = projectData?.client || null;
        const clientData = clientId ? clientMap.get(clientId) : null;

        // Normalize team data IDs
        const teamsData = (task.teams || [])
          .map(teamId => teamMap.get(teamId))
          .filter(Boolean)
          .map(team => ({
            ...team!,
            id: String(team!.id), // Ensure ID is a string
          }));

        return {
          ...task,
          clientId: clientId ? String(clientId) : null, // Ensure ID is a string
          assignedMembersData,
          projectData: projectData ? {
            ...projectData,
            id: String(projectData.id),
          } : null,
          clientData: clientData ? {
            ...clientData,
            id: String(clientData.id),
          } : null,
          teamsData,
          involvedTeamIds: Array.from(involvedTeamIds),
          involvedTeamsData
        };
      }) || [];

    const resolvedProjects =
      data.projects?.map(project => ({
        ...project,
        clientData: project.client ? clientMap.get(project.client) : null,
      })) || [];

    const resolvedTeams =
      data.teams?.map(team => ({
        ...team,
        membersData: team.members?.map(id => memberMap.get(id)).filter(Boolean),
      })) || [];

    const duration = performance.now() - startTime;
    logger.info(`BatchResolver: Resolved all relations in ${duration.toFixed(2)}ms`);

    return {
      resolvedTasks,
      resolvedProjects,
      resolvedTeams,
      stats: {
        totalQueries: memberIds.size + projectIds.size + clientIds.size + teamIds.size,
        cachedHits: 0, // TODO: implémenter le tracking
        notionFetches: 0, // TODO: implémenter le tracking
      },
    };
  }

  // Nettoyer les DataLoaders (utile pour les tests ou le reset)
  clearAll(): void {
    this.memberLoader.clearAll();
    this.projectLoader.clearAll();
    this.clientLoader.clearAll();
    this.teamLoader.clearAll();
    this.taskLoader.clearAll();
  }
}
