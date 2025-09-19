import dotenv from 'dotenv';
import path from 'path';
import { Redis } from '@upstash/redis';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function debugRedisCalendar() {
  console.log('\n🔍 DEBUG REDIS CALENDAR CACHE\n');
  console.log('=====================================\n');
  
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
  });

  try {
    // Lister toutes les clés de type calendar
    console.log('📦 Searching for calendar cache keys...\n');
    const keys = await redis.keys('tasks:calendar:*');
    
    if (keys.length === 0) {
      console.log('❌ No calendar cache keys found\n');
    } else {
      console.log(`✅ Found ${keys.length} calendar cache keys:\n`);
      
      for (const key of keys) {
        console.log(`\n📌 Key: ${key}`);
        
        // Récupérer les données
        const data = await redis.get(key);
        
        if (data && typeof data === 'object' && 'data' in data) {
          const tasks = (data as any).data;
          console.log(`   - Tasks count: ${Array.isArray(tasks) ? tasks.length : 0}`);
          
          if (Array.isArray(tasks) && tasks.length > 0) {
            // Afficher les dates min/max
            const dates = tasks
              .filter((t: any) => t.workPeriod?.startDate)
              .map((t: any) => new Date(t.workPeriod.startDate));
            
            if (dates.length > 0) {
              const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
              const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
              console.log(`   - Date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);
            }
            
            // Afficher quelques tâches de septembre
            const septemberTasks = tasks.filter((t: any) => {
              const date = t.workPeriod?.startDate;
              return date && date.startsWith('2025-09');
            });
            
            console.log(`   - September 2025 tasks: ${septemberTasks.length}`);
            
            if (septemberTasks.length > 0) {
              console.log('   - Sample September tasks:');
              septemberTasks.slice(0, 3).forEach((t: any) => {
                console.log(`     • ${t.title} (${t.workPeriod?.startDate?.split('T')[0]} to ${t.workPeriod?.endDate?.split('T')[0]})`);
              });
            }
          }
        } else {
          console.log('   - No data or invalid format');
        }
        
        // TTL
        const ttl = await redis.ttl(key);
        console.log(`   - TTL: ${ttl > 0 ? `${ttl} seconds (${Math.round(ttl/60)} minutes)` : 'No expiry'}`);
      }
    }
    
    // Vérifier aussi les clés de type task individuel
    console.log('\n\n📦 Checking individual task keys...\n');
    const taskKeys = await redis.keys('task:*');
    console.log(`Found ${taskKeys.length} individual task keys\n`);
    
  } catch (error) {
    console.error('❌ Error debugging cache:', error);
  }
  
  process.exit(0);
}

debugRedisCalendar();