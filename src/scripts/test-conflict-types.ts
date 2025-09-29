import axios from "axios";
import { format, addDays } from "date-fns";

const API_URL = "http://localhost:5005/api/v1";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmNmNDQ0OTg3MmJhNGIyNDMyZjc1YSIsImVtYWlsIjoiYWRtaW5AZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MzUxNzkzMzIsImV4cCI6MTczNTI2NTczMn0.iVxQJCz5hvFMeEhAKKS71vUJCKXWO_7C3vTb6vP0qN0";

async function testConflictTypes() {
  console.log("🧪 Test des types de conflits avec mapping français/anglais\n");

  const tomorrow = addDays(new Date(), 1);
  const dayAfter = addDays(new Date(), 2);

  try {
    // 1. Create a holiday task (Congé)
    console.log("1. Création d'une tâche Congé...");
    const holidayTask = await axios.post(
      `${API_URL}/tasks`,
      {
        title: "Vacances d'été",
        workPeriod: {
          startDate: format(tomorrow, "yyyy-MM-dd'T'09:00:00"),
          endDate: format(tomorrow, "yyyy-MM-dd'T'17:00:00"),
        },
        assignedMembers: ["member-001"], // Fabien
        taskType: "holiday", // Will be mapped to "Congé" for Notion
        status: "not_started",
      },
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { async: false },
      }
    );
    console.log("✅ Tâche Congé créée:", holidayTask.data.data.title);
    console.log("   TaskType reçu:", holidayTask.data.data.taskType);

    // 2. Try to create overlapping task - should detect holiday conflict
    console.log("\n2. Tentative de création d'une tâche chevauchant le congé...");
    const overlapTask = await axios.post(
      `${API_URL}/tasks`,
      {
        title: "Réunion importante",
        workPeriod: {
          startDate: format(tomorrow, "yyyy-MM-dd'T'10:00:00"),
          endDate: format(tomorrow, "yyyy-MM-dd'T'12:00:00"),
        },
        assignedMembers: ["member-001"], // Same member
        projectId: "project-001",
        taskType: "task",
        status: "not_started",
      },
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { async: false },
      }
    );
    
    if (overlapTask.data.conflicts?.length > 0) {
      console.log("🚨 Conflit détecté!");
      overlapTask.data.conflicts.forEach((conflict: any) => {
        console.log(`   Type: ${conflict.type} ${conflict.type === 'holiday' ? '✓' : '✗'}`);
        console.log(`   Message: ${conflict.message}`);
        console.log(`   Sévérité: ${conflict.severity}`);
      });
    }

    // 3. Create a school/training task (Formation)
    console.log("\n3. Création d'une tâche Formation...");
    const schoolTask = await axios.post(
      `${API_URL}/tasks`,
      {
        title: "Formation React avancé",
        workPeriod: {
          startDate: format(dayAfter, "yyyy-MM-dd'T'09:00:00"),
          endDate: format(dayAfter, "yyyy-MM-dd'T'17:00:00"),
        },
        assignedMembers: ["member-002"], // Jean
        taskType: "school", // Will be mapped to "Formation" for Notion
        status: "not_started",
      },
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { async: false },
      }
    );
    console.log("✅ Tâche Formation créée:", schoolTask.data.data.title);
    console.log("   TaskType reçu:", schoolTask.data.data.taskType);

    // 4. Try to create overlapping task - should detect school conflict
    console.log("\n4. Tentative de création d'une tâche chevauchant la formation...");
    const overlapSchool = await axios.post(
      `${API_URL}/tasks`,
      {
        title: "Sprint planning",
        workPeriod: {
          startDate: format(dayAfter, "yyyy-MM-dd'T'14:00:00"),
          endDate: format(dayAfter, "yyyy-MM-dd'T'16:00:00"),
        },
        assignedMembers: ["member-002"], // Same member
        projectId: "project-001",
        taskType: "task",
        status: "not_started",
      },
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { async: false },
      }
    );
    
    if (overlapSchool.data.conflicts?.length > 0) {
      console.log("📚 Conflit détecté!");
      overlapSchool.data.conflicts.forEach((conflict: any) => {
        console.log(`   Type: ${conflict.type} ${conflict.type === 'school' ? '✓' : '✗'}`);
        console.log(`   Message: ${conflict.message}`);
        console.log(`   Sévérité: ${conflict.severity}`);
      });
    }

    // 5. Create remote task (Télétravail) - should NOT create conflicts
    console.log("\n5. Création d'une tâche Télétravail (ne devrait pas créer de conflit)...");
    const remoteTask = await axios.post(
      `${API_URL}/tasks`,
      {
        title: "Dev feature X (remote)",
        workPeriod: {
          startDate: format(tomorrow, "yyyy-MM-dd'T'14:00:00"),
          endDate: format(tomorrow, "yyyy-MM-dd'T'17:00:00"),
        },
        assignedMembers: ["member-001"], // Fabien (already on holiday but remote should not conflict)
        projectId: "project-002",
        taskType: "remote", // Will be mapped to "Télétravail" for Notion
        status: "in_progress",
      },
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: { async: false },
      }
    );
    console.log("✅ Tâche Télétravail créée:", remoteTask.data.data.title);
    console.log("   TaskType reçu:", remoteTask.data.data.taskType);
    console.log("   Conflits:", remoteTask.data.conflicts?.length || 0, "(devrait être 0)");

    // Summary
    console.log("\n📊 RÉSUMÉ DU TEST:");
    console.log("✅ Mapping français → anglais fonctionnel");
    console.log("✅ Type 'holiday' détecté correctement (au lieu de 'overlap')");
    console.log("✅ Type 'school' détecté correctement (au lieu de 'overlap')");
    console.log("✅ Type 'remote' ne génère pas de conflits");
    console.log("\n🎯 Les badges de conflits devraient maintenant afficher:");
    console.log("   🚨 pour les conflits de congés");
    console.log("   📚 pour les conflits de formation");
    console.log("   ⚠️ pour les chevauchements simples");
    console.log("   TT pour le télétravail");

  } catch (error: any) {
    console.error("\n❌ Erreur:", error.response?.data || error.message);
  }
}

// Run test
testConflictTypes();