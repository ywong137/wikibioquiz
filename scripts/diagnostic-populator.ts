import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNull, sql, and } from 'drizzle-orm';
import OpenAI from 'openai';
import { writeFileSync, existsSync } from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class DiagnosticLogger {
  private logFile: string;
  
  constructor() {
    this.logFile = `/tmp/diagnostic_${Date.now()}.log`;
    this.log('🔍 DIAGNOSTIC POPULATOR STARTED');
  }
  
  log(message: string, error?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp}: ${message}${error ? ` | ERROR: ${JSON.stringify(error)}` : ''}\n`;
    console.log(logEntry.trim());
    writeFileSync(this.logFile, logEntry, { flag: 'a' });
  }
  
  getLogFile() {
    return this.logFile;
  }
}

async function testDatabaseConnection(logger: DiagnosticLogger): Promise<boolean> {
  try {
    logger.log('🔌 Testing database connection...');
    const result = await db.execute('SELECT 1 as test');
    logger.log('✅ Database connection successful');
    return true;
  } catch (error) {
    logger.log('❌ Database connection failed', error);
    return false;
  }
}

async function testOpenAIConnection(logger: DiagnosticLogger): Promise<boolean> {
  try {
    logger.log('🤖 Testing OpenAI connection...');
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Test connection - respond with just 'OK'" }],
      max_tokens: 5
    });
    logger.log('✅ OpenAI connection successful');
    return true;
  } catch (error) {
    logger.log('❌ OpenAI connection failed', error);
    return false;
  }
}

async function testWikipediaAPI(logger: DiagnosticLogger): Promise<boolean> {
  try {
    logger.log('📖 Testing Wikipedia API...');
    const response = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/Albert_Einstein');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    logger.log('✅ Wikipedia API accessible');
    return true;
  } catch (error) {
    logger.log('❌ Wikipedia API failed', error);
    return false;
  }
}

async function getDatabaseStats(logger: DiagnosticLogger) {
  try {
    const result = await db.execute(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed,
        COUNT(*) FILTER (WHERE processed_at IS NULL AND filtered_out = 0) as unprocessed,
        COUNT(*) FILTER (WHERE filtered_out = 1) as filtered,
        MAX(processed_at) as latest_update,
        CASE 
          WHEN MAX(processed_at) IS NULL THEN 0
          ELSE EXTRACT(EPOCH FROM (NOW() - MAX(processed_at)))/60 
        END as minutes_since_update
      FROM famous_people
    `);
    
    const stats = result.rows[0];
    logger.log(`📊 Database Stats: ${stats.processed}/${stats.total} processed (${stats.unprocessed} remaining, ${stats.filtered} filtered)`);
    logger.log(`🕒 Last update: ${stats.minutes_since_update} minutes ago`);
    return stats;
  } catch (error) {
    logger.log('❌ Failed to get database stats', error);
    return null;
  }
}

async function processOnePerson(logger: DiagnosticLogger): Promise<boolean> {
  try {
    logger.log('👤 Attempting to process one person...');
    
    // Get one unprocessed person
    const unprocessedPeople = await db
      .select()
      .from(famousPeople)
      .where(and(
        eq(famousPeople.filteredOut, 0),
        isNull(famousPeople.processedAt)
      ))
      .limit(1);
    
    if (unprocessedPeople.length === 0) {
      logger.log('⚠️ No unprocessed people found');
      return false;
    }
    
    const person = unprocessedPeople[0];
    logger.log(`🔄 Processing: ${person.name}`);
    
    // Test Wikipedia fetch
    const wikipediaTitle = person.name.replace(/ /g, '_');
    const sectionsUrl = `https://en.wikipedia.org/api/rest_v1/page/sections/${wikipediaTitle}`;
    
    logger.log(`📖 Fetching sections from: ${sectionsUrl}`);
    
    const sectionsResponse = await fetch(sectionsUrl);
    if (!sectionsResponse.ok) {
      throw new Error(`Wikipedia sections API returned ${sectionsResponse.status}`);
    }
    
    const sectionsData = await sectionsResponse.json();
    const sections = sectionsData.map((section: any) => section.line || section.anchor || 'Unknown').filter(Boolean);
    
    logger.log(`📋 Found ${sections.length} sections`);
    
    if (sections.length === 0) {
      logger.log('⚠️ No sections found, skipping AI hint generation');
    } else {
      // Test AI hint generation
      logger.log('🤖 Testing AI hint generation...');
      
      const hintPrompt = `Generate a concise biographical hint for ${person.name}. Include their main profession/role and a key historical achievement or characteristic. Keep it under 50 words and make it guessable but not too obvious.`;
      
      const hintResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: hintPrompt }],
        max_tokens: 100
      });
      
      const hint = hintResponse.choices[0].message.content || `Famous ${person.occupation} from ${person.timeperiod} era`;
      logger.log(`💡 Generated hint: ${hint}`);
    }
    
    // Generate initials
    const initials = generateInitials(person.name);
    logger.log(`🔤 Generated initials: ${initials}`);
    
    // Update database
    await db
      .update(famousPeople)
      .set({
        sections: sections,
        hint: `Famous ${person.occupation} from ${person.timeperiod} era`,
        initials: initials,
        processedAt: new Date()
      })
      .where(eq(famousPeople.id, person.id));
    
    logger.log(`✅ Successfully processed ${person.name}`);
    return true;
    
  } catch (error) {
    logger.log('❌ Failed to process person', error);
    return false;
  }
}

function generateInitials(fullName: string): string {
  // Handle "X of Y" patterns
  if (fullName.includes(' of ')) {
    const parts = fullName.split(' of ');
    const beforeOf = parts[0].trim().split(' ').map(word => word.charAt(0).toUpperCase()).join('. ');
    const afterOf = parts[1].trim().split(' ').map(word => word.charAt(0).toUpperCase()).join('. ');
    return `${beforeOf} of ${afterOf}`;
  }
  
  // Regular name processing
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length === 1) {
    return nameParts[0].charAt(0).toUpperCase() + '.';
  }
  
  return nameParts.map(part => part.charAt(0).toUpperCase()).join('. ') + '.';
}

async function runDiagnostic() {
  const logger = new DiagnosticLogger();
  
  logger.log('🔍 Starting comprehensive diagnostic...');
  
  // Test all connections
  const dbOk = await testDatabaseConnection(logger);
  const openaiOk = await testOpenAIConnection(logger);
  const wikiOk = await testWikipediaAPI(logger);
  
  if (!dbOk || !openaiOk || !wikiOk) {
    logger.log('❌ Critical services unavailable - cannot proceed');
    process.exit(1);
  }
  
  // Get current stats
  await getDatabaseStats(logger);
  
  // Try to process one person
  const processOk = await processOnePerson(logger);
  
  if (processOk) {
    logger.log('✅ Single processing test successful');
    logger.log('🚀 System appears functional - ready for bulk processing');
  } else {
    logger.log('❌ Single processing test failed');
  }
  
  logger.log(`📝 Full diagnostic log: ${logger.getLogFile()}`);
  
  // If everything works, start continuous processing
  if (processOk) {
    logger.log('🔄 Starting continuous processing...');
    let processed = 0;
    const maxErrors = 10;
    let errorCount = 0;
    
    while (processed < 50 && errorCount < maxErrors) { // Process 50 for testing
      try {
        const success = await processOnePerson(logger);
        if (success) {
          processed++;
          errorCount = 0; // Reset error count on success
          logger.log(`📈 Progress: ${processed}/50 completed`);
        } else {
          errorCount++;
          logger.log(`⚠️ Processing failed, error count: ${errorCount}/${maxErrors}`);
        }
        
        // Brief pause between entries
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        errorCount++;
        logger.log(`❌ Unexpected error in processing loop (${errorCount}/${maxErrors})`, error);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    logger.log(`🏁 Diagnostic batch complete: ${processed} entries processed`);
  }
}

// Run diagnostic
runDiagnostic().catch(console.error);