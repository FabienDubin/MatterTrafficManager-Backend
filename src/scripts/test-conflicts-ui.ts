import axios from "axios";
import { format, addHours } from "date-fns";

const API_URL = "http://localhost:5005/api/v1";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmNmNDQ0OTg3MmJhNGIyNDMyZjc1YSIsImVtYWlsIjoiYWRtaW5AZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MzUxNzkzMzIsImV4cCI6MTczNTI2NTczMn0.iVxQJCz5hvFMeEhAKKS71vUJCKXWO_7C3vTb6vP0qN0";

async function testConflicts() {
  console.log("🧪 Test des conflits dans l'UI");

  const now = new Date();
  const startDate = format(now, "yyyy-MM-dd'T'09:00:00");
  const endDate = format(now, "yyyy-MM-dd'T'11:00:00");

  try {
    // 1. Créer une première tâche normale
    console.log("\n1. Création de la première tâche (sans conflit)...");
    const task1Response = await axios.post(
      `${API_URL}/tasks`,
      {
        title: "Réunion équipe design",
        workPeriod: {
          startDate,
          endDate,
        },
        assignedMembers: ["member-001"], // Fabien
        projectId: "project-001",
        status: "in_progress",
      },
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { async: false },
      }
    );

    console.log("✅ Tâche 1 créée:", task1Response.data.data.title);
    if (task1Response.data.conflicts) {
      console.log("   Conflits détectés:", task1Response.data.conflicts);
    }

    // 2. Créer une tâche qui chevauche (conflit)
    console.log("\n2. Création d'une tâche qui chevauche...");
    const overlapStart = format(now, "yyyy-MM-dd'T'10:00:00");
    const overlapEnd = format(now, "yyyy-MM-dd'T'12:00:00");

    const task2Response = await axios.post(
      `${API_URL}/tasks`,
      {
        title: "Review sprint - CONFLIT ATTENDU",
        workPeriod: {
          startDate: overlapStart,
          endDate: overlapEnd,
        },
        assignedMembers: ["member-001"], // Même membre = conflit
        projectId: "project-002",
        status: "not_started",
      },
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { async: false },
      }
    );

    console.log("✅ Tâche 2 créée:", task2Response.data.data.title);
    if (task2Response.data.conflicts && task2Response.data.conflicts.length > 0) {
      console.log("🚨 CONFLITS DÉTECTÉS:");
      task2Response.data.conflicts.forEach((conflict: any) => {
        console.log(`   - Type: ${conflict.type}`);
        console.log(`   - Message: ${conflict.message}`);
        console.log(`   - Sévérité: ${conflict.severity}`);
      });
    } else {
      console.log("⚠️ Aucun conflit détecté (anormal!)");
    }

    // 3. Créer une tâche en télétravail (remote)
    console.log("\n3. Création d'une tâche télétravail...");
    const remoteStart = format(now, "yyyy-MM-dd'T'14:00:00");
    const remoteEnd = format(now, "yyyy-MM-dd'T'16:00:00");

    const task3Response = await axios.post(
      `${API_URL}/tasks`,
      {
        title: "Développement feature X",
        workPeriod: {
          startDate: remoteStart,
          endDate: remoteEnd,
        },
        assignedMembers: ["member-002"], // Jean
        projectId: "project-003",
        status: "in_progress",
        taskType: "remote", // Télétravail
      },
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { async: false },
      }
    );

    console.log("✅ Tâche 3 (télétravail) créée:", task3Response.data.data.title);
    console.log("   Type:", task3Response.data.data.taskType);

    // 4. Récupérer les tâches pour vérifier
    console.log("\n4. Récupération des tâches du calendrier...");
    const calendarResponse = await axios.get(
      `${API_URL}/tasks/calendar`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: {
          startDate: format(now, "yyyy-MM-dd'T'00:00:00"),
          endDate: format(addHours(now, 24), "yyyy-MM-dd'T'23:59:59"),
        },
      }
    );

    console.log(`\n✅ ${calendarResponse.data.data.tasks.length} tâches récupérées`);
    
    // Afficher un résumé
    console.log("\n📊 RÉSUMÉ:");
    console.log("1. Tâche normale créée ✅");
    console.log("2. Tâche avec conflit créée (devrait afficher ⚠️) ✅");
    console.log("3. Tâche télétravail créée (devrait afficher badge TT) ✅");
    console.log("\n🎯 Vérifiez maintenant l'interface sur http://localhost:5174");
    console.log("   - Les badges de conflit ⚠️ devraient apparaître");
    console.log("   - Les badges TT devraient apparaître pour le télétravail");

  } catch (error: any) {
    console.error("\n❌ Erreur:", error.response?.data || error.message);
  }
}

// Exécuter le test
testConflicts();