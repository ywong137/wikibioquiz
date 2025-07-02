import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { db } from '../server/db';
import { writeFileSync, existsSync } from 'fs';

const execAsync = promisify(exec);

interface PipelineStats {
  processed: number;
  remaining: number;
  lastUpdated: Date | null;
  minutesSinceUpdate: number;
}

interface PipelinePhase {
  name: string;
  targetEntries: number;
  description: string;
}

const PHASES: PipelinePhase[] = [
  { name: "Phase1", targetEntries: 100, description: "Initial validation sample" },
  { name: "Phase2", targetEntries: 1000, description: "Extended quality validation" },
  { name: "Phase3", targetEntries: 9372, description: "Complete database processing" }
];

class PipelineManager {
  private currentPhase = 0;
  private monitoringActive = false;
  private logPath = '/tmp/pipeline.log';
  
  constructor() {
    this.log("🚀 Pipeline Manager initialized");
  }

  private log(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: ${message}\n`;
    console.log(logEntry.trim());
    writeFileSync(this.logPath, logEntry, { flag: 'a' });
  }

  async getDatabaseStats(): Promise<PipelineStats> {
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

  async isScriptRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('pgrep -f "prepopulate-wikipedia-data"');
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async killExistingScripts(): Promise<void> {
    try {
      await execAsync('pkill -f "prepopulate-wikipedia-data"');
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.log("🧹 Cleaned up existing scripts");
    } catch {
      // Ignore errors
    }
  }

  async startPrepopulationScript(): Promise<void> {
    this.log("🚀 Starting prepopulation script");
    
    const child = spawn('npx', ['tsx', 'scripts/prepopulate-wikipedia-data.ts'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    child.unref();
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  async monitorPhase(phase: PipelinePhase): Promise<boolean> {
    this.log(`📊 Starting ${phase.name}: ${phase.description} (Target: ${phase.targetEntries} entries)`);
    
    let lastProcessedCount = 0;
    let stallCount = 0;
    const maxStalls = 4;
    const checkInterval = 25000; // 25 seconds
    const maxStallTime = 300; // 5 minutes
    
    while (this.monitoringActive) {
      try {
        const stats = await this.getDatabaseStats();
        const isRunning = await this.isScriptRunning();
        
        this.log(`📈 ${stats.processed}/${phase.targetEntries} processed, ${stats.remaining} remaining, Running: ${isRunning}, Last update: ${stats.minutesSinceUpdate.toFixed(1)}min ago`);
        
        // Check if phase target reached
        if (stats.processed >= phase.targetEntries) {
          this.log(`✅ ${phase.name} completed! ${stats.processed} entries processed.`);
          await this.killExistingScripts();
          return true;
        }
        
        // Check for issues requiring restart
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
          this.log(`🔄 Restarting script - Running: ${isRunning}, Stalled: ${stats.minutesSinceUpdate.toFixed(1)}min, Stall count: ${stallCount}`);
          await this.killExistingScripts();
          await this.startPrepopulationScript();
          stallCount = 0;
        }
        
      } catch (error) {
        this.log(`❌ Monitoring error: ${error}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    return false;
  }

  async validatePhaseQuality(targetCount: number): Promise<boolean> {
    this.log(`🔍 Validating quality of ${targetCount} processed entries...`);
    
    const qualityCheck = await db.execute(`
      SELECT 
        COUNT(*) as total,
        MIN(array_length(sections, 1)) as min_sections,
        MAX(array_length(sections, 1)) as max_sections,
        ROUND(AVG(array_length(sections, 1)), 1) as avg_sections,
        COUNT(*) FILTER (WHERE array_length(sections, 1) >= 6) as quality_entries
      FROM famous_people 
      WHERE processed_at IS NOT NULL
      LIMIT ${targetCount}
    `);

    const row = qualityCheck.rows[0];
    const total = parseInt(row.total as string);
    const qualityEntries = parseInt(row.quality_entries as string);
    const avgSections = parseFloat(row.avg_sections as string);
    
    this.log(`📊 Quality Report: ${total} entries, ${avgSections} avg sections, ${qualityEntries} quality entries (6+ sections)`);
    
    return (qualityEntries / total) >= 0.9; // 90% quality threshold
  }

  async runPipeline(): Promise<void> {
    this.monitoringActive = true;
    
    try {
      for (let i = this.currentPhase; i < PHASES.length; i++) {
        const phase = PHASES[i];
        this.currentPhase = i;
        
        const success = await this.monitorPhase(phase);
        if (!success) {
          this.log(`❌ ${phase.name} failed or was interrupted`);
          break;
        }
        
        // Validate quality before proceeding
        const qualityPassed = await this.validatePhaseQuality(phase.targetEntries);
        if (!qualityPassed) {
          this.log(`⚠️ ${phase.name} quality validation failed, but continuing...`);
        }
        
        this.log(`🎉 ${phase.name} completed successfully!`);
        
        // Brief pause between phases
        if (i < PHASES.length - 1) {
          this.log(`⏸️ Pausing 10 seconds before next phase...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      
      this.log("🏆 Pipeline completed successfully! All entries processed.");
      
    } catch (error) {
      this.log(`💥 Pipeline failed: ${error}`);
    } finally {
      this.monitoringActive = false;
      await this.killExistingScripts();
    }
  }

  async stopPipeline(): Promise<void> {
    this.log("🛑 Pipeline stop requested");
    this.monitoringActive = false;
    await this.killExistingScripts();
  }
}

// Command line interface
const command = process.argv[2] || 'start';
const manager = new PipelineManager();

process.on('SIGINT', async () => {
  console.log('\n🛑 Interrupt received, stopping pipeline...');
  await manager.stopPipeline();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Termination received, stopping pipeline...');
  await manager.stopPipeline();
  process.exit(0);
});

if (command === 'start') {
  console.log('🎯 Starting complete database processing pipeline...');
  manager.runPipeline().catch(console.error);
} else {
  console.log('Usage: npx tsx scripts/pipeline-manager.ts [start]');
}