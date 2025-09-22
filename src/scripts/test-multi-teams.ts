#!/usr/bin/env node
/**
 * Script de test pour vérifier que les membres multi-équipes sont bien gérés
 * Usage: npm run test:multi-teams
 */

import dotenv from 'dotenv';
import path from 'path';
import notionService from '../services/notion.service';
import logger from '../config/logger.config';

// Charger les variables d'environnement
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function testMultiTeams() {
  logger.info('🧪 Test des membres multi-équipes...\n');
  
  try {
    // 1. Récupérer quelques membres
    logger.info('1️⃣ Récupération des membres...');
    const members = await notionService.getAllUsers();
    logger.info(`   Trouvé ${members.length} membres`);
    
    // 2. Analyser les équipes
    logger.info('\n2️⃣ Analyse des équipes par membre:');
    const multiTeamMembers = members.filter(m => m.teams && m.teams.length > 1);
    const singleTeamMembers = members.filter(m => m.teams && m.teams.length === 1);
    const noTeamMembers = members.filter(m => !m.teams || m.teams.length === 0);
    
    logger.info(`   - Membres avec plusieurs équipes: ${multiTeamMembers.length}`);
    logger.info(`   - Membres avec une seule équipe: ${singleTeamMembers.length}`);
    logger.info(`   - Membres sans équipe: ${noTeamMembers.length}`);
    
    // 3. Afficher quelques exemples de multi-équipes
    if (multiTeamMembers.length > 0) {
      logger.info('\n3️⃣ Exemples de membres multi-équipes:');
      multiTeamMembers.slice(0, 3).forEach(member => {
        logger.info(`   - ${member.name}: ${member.teams.length} équipes`);
        logger.info(`     IDs: ${member.teams.join(', ')}`);
      });
    }
    
    // 4. Tester le batch resolver avec enrichissement
    logger.info('\n4️⃣ Test du batch resolver avec enrichissement...');
    const tasks = await notionService.getAllTrafficTasks();
    const tasksWithMembers = tasks.filter(t => t.assignedMembers && t.assignedMembers.length > 0).slice(0, 5);
    
    const { resolvedTasks } = await notionService.batchResolveRelations({ 
      tasks: tasksWithMembers 
    });
    
    // 5. Vérifier les équipes impliquées
    logger.info('\n5️⃣ Analyse des équipes impliquées dans les tasks:');
    resolvedTasks.forEach((task: any) => {
      if (task.involvedTeamIds && task.involvedTeamIds.length > 0) {
        logger.info(`   Task "${task.title}"`);
        logger.info(`     - Membres assignés: ${task.assignedMembersData.length}`);
        logger.info(`     - Équipes impliquées: ${task.involvedTeamIds.length}`);
        
        // Afficher les détails
        task.assignedMembersData.forEach((member: any) => {
          logger.info(`       • ${member.name} (${member.teams.length} équipe(s))`);
        });
        
        if (task.involvedTeamsData) {
          const teamNames = task.involvedTeamsData.map((t: any) => t.name).join(', ');
          logger.info(`     - Noms des équipes: ${teamNames}`);
        }
      }
    });
    
    // 6. Statistiques finales
    logger.info('\n6️⃣ Statistiques finales:');
    const totalTeamsInvolved = new Set<string>();
    resolvedTasks.forEach((task: any) => {
      if (task.involvedTeamIds) {
        task.involvedTeamIds.forEach((id: string) => totalTeamsInvolved.add(id));
      }
    });
    
    logger.info(`   - Total d'équipes impliquées dans les ${resolvedTasks.length} tasks: ${totalTeamsInvolved.size}`);
    logger.info(`   - Moyenne d'équipes par task: ${(resolvedTasks.reduce((sum: number, t: any) => sum + (t.involvedTeamIds?.length || 0), 0) / resolvedTasks.length).toFixed(1)}`);
    
    logger.info('\n✅ Test des membres multi-équipes terminé avec succès!');
    
  } catch (error) {
    logger.error('❌ Erreur lors du test:', error);
    process.exit(1);
  }
}

// Exécuter le test
testMultiTeams().then(() => {
  process.exit(0);
}).catch(error => {
  logger.error('Erreur fatale:', error);
  process.exit(1);
});