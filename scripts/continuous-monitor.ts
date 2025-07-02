import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { db } from '../server/db';

const execAsync = promisify(exec);

interface Stats {
  processed: number;
  remaining: number;
  lastUpdated: Date | null;
  minutesSinceUpdate: number;
}

async function getDatabaseStats(): Promise<Stats> {
  const result = await db.execute(`
    SELECT 
      COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed,
      COUNT(*) FILTER (WHERE processed_at IS NULL AND filtered_out = 0) as remaining,
      MAX(processed_at) as last_updated,
      CASE 
        WHEN MAX(processed_at) IS NULL THEN 0
        ELSE EXTRACT(EPOCH FROM (NOW() - MAX(processed_at)))/60 
      END as minutes_since_update
    FROM famous_people
  `);

  const row = result.rows[0];
  return {
    processed: parseInt(row.processed as string),
    remaining: parseInt(row.remaining as string),
    lastUpdated: row.last_updated as Date,
    minutesSinceUpdate: parseFloat(row.minutes_since_update as string)
  };
}

async function isScriptRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('pgrep -f "prepopulate-wikipedia-data"');
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function killExistingScripts(): Promise<void> {
  try {
    await execAsync('pkill -f "prepopulate-wikipedia-data"');
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch {
    // Ignore errors
  }
}

function startPrepopulationScript(): Promise<void> {
  return new Promise((resolve) => {
    console.log(`🚀 ${new Date().toLocaleTimeString()}: Starting prepopulation script...`);
    
    const child = spawn('npx', ['tsx', 'scripts/prepopulate-wikipedia-data.ts'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    child.unref();
    setTimeout(resolve, 2000); // Give script time to start
  });
}

async function monitorProgress(targetEntries: number): Promise<void> {
  console.log(`📊 Starting continuous monitoring for ${targetEntries} entries`);
  
  let lastProcessedCount = 0;
  let stallCount = 0;
  const maxStalls = 3;
  const checkInterval = 20000; // 20 seconds
  const maxStallTime = 240; // 4 minutes
  
  while (true) {
    try {
      const stats = await getDatabaseStats();
      const isRunning = await isScriptRunning();
      
      console.log(`📈 ${new Date().toLocaleTimeString()}: ${stats.processed}/${targetEntries} processed, ${stats.remaining} remaining, Script running: ${isRunning}, Last update: ${stats.minutesSinceUpdate.toFixed(1)}min ago`);
      
      // Check if target reached
      if (stats.processed >= targetEntries) {
        console.log(`🎉 Target reached! ${stats.processed} entries completed.`);
        await killExistingScripts();
        break;
      }
      
      // Check for stalled progress
      const needsRestart = !isRunning || 
                          stats.minutesSinceUpdate > maxStallTime || 
                          (stats.processed === lastProcessedCount && stallCount >= maxStalls);
      
      if (stats.processed === lastProcessedCount) {
        stallCount++;
      } else {
        stallCount = 0;
        lastProcessedCount = stats.processed;
      }
      
      if (needsRestart) {
        console.log(`🔄 ${new Date().toLocaleTimeString()}: Restarting - Running: ${isRunning}, Stalled: ${stats.minutesSinceUpdate.toFixed(1)}min, Stall count: ${stallCount}`);
        await killExistingScripts();
        await startPrepopulationScript();
        stallCount = 0;
      }
      
    } catch (error) {
      console.error(`❌ Monitoring error:`, error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
}

// Command line arguments
const targetEntries = parseInt(process.argv[2]) || 100;

console.log(`🎯 Starting monitoring for ${targetEntries} entries`);
console.log(`⏰ Check interval: 20 seconds`);
console.log(`🕐 Max stall time: 4 minutes`);

// Start monitoring
monitorProgress(targetEntries)
  .then(() => {
    console.log(`✅ Monitoring completed successfully!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`❌ Monitor failed:`, error);
    process.exit(1);
  });