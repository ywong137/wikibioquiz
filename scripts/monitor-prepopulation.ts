import { exec } from 'child_process';
import { promisify } from 'util';
import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNull } from 'drizzle-orm';

const execAsync = promisify(exec);

interface MonitorStats {
  totalProcessed: number;
  remainingEntries: number;
  lastProcessedTime: Date | null;
  minutesSinceLastUpdate: number;
}

async function getProcessingStats(): Promise<MonitorStats> {
  const stats = await db.execute(`
    SELECT 
      COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as total_processed,
      COUNT(*) FILTER (WHERE processed_at IS NULL AND filtered_out = 0) as remaining_entries,
      MAX(processed_at) as last_processed_time,
      CASE 
        WHEN MAX(processed_at) IS NULL THEN 0
        ELSE EXTRACT(EPOCH FROM (NOW() - MAX(processed_at)))/60 
      END as minutes_since_last_update
    FROM famous_people
  `);

  const row = stats.rows[0];
  return {
    totalProcessed: parseInt(row.total_processed as string),
    remainingEntries: parseInt(row.remaining_entries as string),
    lastProcessedTime: row.last_processed_time as Date,
    minutesSinceLastUpdate: parseFloat(row.minutes_since_last_update as string)
  };
}

async function isScriptRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('ps aux | grep "prepopulate-wikipedia-data" | grep -v grep | wc -l');
    return parseInt(stdout.trim()) > 0;
  } catch {
    return false;
  }
}

async function startPrepopulationScript(): Promise<void> {
  console.log('🚀 Starting prepopulation script...');
  
  // Start script in background
  exec('npx tsx scripts/prepopulate-wikipedia-data.ts', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Script error: ${error.message}`);
    }
    if (stderr) {
      console.error(`⚠️ Script stderr: ${stderr}`);
    }
  });
  
  // Give script time to start
  await new Promise(resolve => setTimeout(resolve, 2000));
}

async function killExistingScripts(): Promise<void> {
  try {
    await execAsync('pkill -f "prepopulate-wikipedia-data" || true');
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch {
    // Ignore errors when killing processes
  }
}

async function monitorAndRestart(targetEntries: number = 100): Promise<void> {
  console.log(`📊 Starting monitoring for ${targetEntries} entries...`);
  
  let consecutiveStalls = 0;
  let lastProcessedCount = 0;
  
  while (true) {
    const stats = await getProcessingStats();
    const isRunning = await isScriptRunning();
    
    console.log(`📈 Status: ${stats.totalProcessed} processed, ${stats.remainingEntries} remaining, last update ${stats.minutesSinceLastUpdate.toFixed(1)} minutes ago`);
    
    // Check if we've reached our target
    if (stats.totalProcessed >= targetEntries) {
      console.log(`🎉 Target reached! ${stats.totalProcessed} entries processed successfully.`);
      await killExistingScripts();
      break;
    }
    
    // Check if script needs restart (stalled for >3 minutes or not running)
    const needsRestart = !isRunning || stats.minutesSinceLastUpdate > 3;
    
    // Track if we're making progress
    if (stats.totalProcessed === lastProcessedCount) {
      consecutiveStalls++;
    } else {
      consecutiveStalls = 0;
      lastProcessedCount = stats.totalProcessed;
    }
    
    if (needsRestart || consecutiveStalls > 2) {
      console.log(`🔄 Restarting script - Running: ${isRunning}, Minutes stalled: ${stats.minutesSinceLastUpdate.toFixed(1)}, Consecutive stalls: ${consecutiveStalls}`);
      
      await killExistingScripts();
      await startPrepopulationScript();
      consecutiveStalls = 0;
    }
    
    // Wait 30 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

// Parse command line argument for target entries
const targetEntries = parseInt(process.argv[2]) || 100;

console.log(`🎯 Target: ${targetEntries} entries`);
monitorAndRestart(targetEntries).catch(console.error);