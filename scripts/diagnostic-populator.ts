import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { wikipediaOAuth } from './wikipedia-oauth';
import OpenAI from 'openai';
import { writeFileSync } from 'fs';

class DiagnosticLogger {
  private logFile: string;
  
  constructor() {
    this.logFile = `diagnostic-${Date.now()}.log`;
  }
  
  log(message: string, error?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    
    if (error) {
      console.error(logEntry, error);
      this.writeToFile(`${logEntry}\nError: ${error}\nStack: ${error.stack}\n`);
    } else {
      console.log(logEntry);
      this.writeToFile(logEntry);
    }
  }
  
  private writeToFile(content: string) {
    try {
      writeFileSync(this.logFile, content + '\n', { flag: 'a' });
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }
  
  getLogFile() {
    return this.logFile;
  }
}

// Test database connection
async function testDatabaseConnection(logger: DiagnosticLogger): Promise<boolean> {
  try {
    logger.log('Testing database connection...');
    const result = await db.select().from(famousPeople).limit(1);
    logger.log(`✅ Database connection successful, found ${result.length} records`);
    return true;
  } catch (error) {
    logger.log('❌ Database connection failed', error);
    return false;
  }
}

// Test OpenAI connection
async function testOpenAIConnection(logger: DiagnosticLogger): Promise<boolean> {
  try {
    logger.log('Testing OpenAI API connection...');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    if (!process.env.OPENAI_API_KEY) {
      logger.log('❌ OPENAI_API_KEY not found in environment');
      return false;
    }
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say hello" }],
      max_tokens: 10
    });
    
    logger.log(`✅ OpenAI API connection successful, response: ${response.choices[0].message.content}`);
    return true;
  } catch (error) {
    logger.log('❌ OpenAI API connection failed', error);
    return false;
  }
}

// Test Wikipedia API connection
async function testWikipediaAPI(logger: DiagnosticLogger): Promise<boolean> {
  try {
    logger.log('Testing Wikipedia OAuth API...');
    
    // Test with a well-known person who should have sections
    const testSections = await wikipediaOAuth.fetchWikipediaSections('Albert Einstein');
    logger.log(`✅ Wikipedia sections API successful, got ${testSections.length} sections for Albert Einstein`);
    
    const testBiography = await wikipediaOAuth.fetchWikipediaBiography('Albert Einstein');
    logger.log(`✅ Wikipedia biography API successful, got ${testBiography.length} characters for Albert Einstein`);
    
    return true;
  } catch (error) {
    logger.log('❌ Wikipedia API failed', error);
    return false;
  }
}

// Get database statistics
async function getDatabaseStats(logger: DiagnosticLogger) {
  try {
    const total = await db.select({ count: sql<number>`count(*)` }).from(famousPeople);
    const processed = await db.select({ count: sql<number>`count(*)` }).from(famousPeople).where(sql`processed_at IS NOT NULL`);
    const withSections = await db.select({ count: sql<number>`count(*)` }).from(famousPeople).where(sql`sections IS NOT NULL`);
    const withHints = await db.select({ count: sql<number>`count(*)` }).from(famousPeople).where(sql`ai_hint_1 IS NOT NULL`);
    
    logger.log(`Database stats:`);
    logger.log(`  Total entries: ${total[0].count}`);
    logger.log(`  Processed: ${processed[0].count}`);
    logger.log(`  With sections: ${withSections[0].count}`);
    logger.log(`  With AI hints: ${withHints[0].count}`);
    
    return { total: total[0].count, processed: processed[0].count, withSections: withSections[0].count, withHints: withHints[0].count };
  } catch (error) {
    logger.log('❌ Failed to get database stats', error);
    return null;
  }
}

// Test processing one person end-to-end
async function processOnePerson(logger: DiagnosticLogger): Promise<boolean> {
  try {
    logger.log('Testing end-to-end processing for one person...');
    
    // Get an unprocessed person
    const person = await db
      .select()
      .from(famousPeople)
      .where(sql`processed_at IS NULL`)
      .limit(1);
    
    if (person.length === 0) {
      logger.log('❌ No unprocessed people found');
      return false;
    }
    
    const testPerson = person[0];
    logger.log(`Testing with: ${testPerson.name}`);
    
    // Test Wikipedia sections
    logger.log('Step 1: Fetching Wikipedia sections...');
    const sections = await wikipediaOAuth.fetchWikipediaSections(testPerson.name);
    logger.log(`Got ${sections.length} sections`);
    
    if (sections.length < 6) {
      logger.log(`⚠️ Person has insufficient sections (${sections.length} < 6), would be skipped`);
      return true; // This is expected behavior, not a failure
    }
    
    // Test Wikipedia biography
    logger.log('Step 2: Fetching Wikipedia biography...');
    const biography = await wikipediaOAuth.fetchWikipediaBiography(testPerson.name);
    logger.log(`Got ${biography.length} characters of biography`);
    
    // Test OpenAI hints
    logger.log('Step 3: Generating AI hints...');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const prompt = `Generate 3 progressive hints for ${testPerson.name}. Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 500
    });
    
    const hints = JSON.parse(response.choices[0].message.content || '{}');
    logger.log(`Generated hints: ${Object.keys(hints).length} hints`);
    
    logger.log('✅ End-to-end processing successful');
    return true;
    
  } catch (error) {
    logger.log('❌ End-to-end processing failed', error);
    return false;
  }
}

function generateInitials(fullName: string): string {
  const words = fullName.split(' ').filter(word => word.length > 0);
  
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].charAt(0).toUpperCase() + '.';
  
  const initials: string[] = [];
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const lowerWord = word.toLowerCase();
    
    // Skip common lowercase connecting words, but preserve "of" patterns
    if (['van', 'der', 'de', 'la', 'le', 'du', 'da', 'ibn', 'bin', 'al', 'el'].includes(lowerWord)) {
      continue;
    }
    
    // Handle Roman numerals
    if (/^[ivxlcdm]+$/i.test(word)) {
      initials.push(word.toUpperCase() + '.');
      continue;
    }
    
    // Handle "of" patterns - preserve them
    if (lowerWord === 'of' && i > 0 && i < words.length - 1) {
      initials.push('of');
      continue;
    }
    
    // Handle "the" patterns - preserve them
    if (lowerWord === 'the' && i > 0) {
      initials.push('the');
      continue;
    }
    
    // Regular word - take first letter
    initials.push(word.charAt(0).toUpperCase() + '.');
  }
  
  return initials.join(' ');
}

async function runDiagnostic() {
  const logger = new DiagnosticLogger();
  
  logger.log('🔍 STARTING COMPREHENSIVE DIAGNOSTIC');
  logger.log('=====================================');
  
  // Test all components
  const dbOk = await testDatabaseConnection(logger);
  const openaiOk = await testOpenAIConnection(logger);
  const wikiOk = await testWikipediaAPI(logger);
  
  logger.log('');
  logger.log('API STATUS SUMMARY:');
  logger.log(`Database: ${dbOk ? '✅ OK' : '❌ FAILED'}`);
  logger.log(`OpenAI: ${openaiOk ? '✅ OK' : '❌ FAILED'}`);
  logger.log(`Wikipedia: ${wikiOk ? '✅ OK' : '❌ FAILED'}`);
  
  if (!dbOk || !openaiOk || !wikiOk) {
    logger.log('');
    logger.log('❌ CRITICAL: One or more APIs are failing');
    logger.log('Cannot proceed with population until all APIs are working');
    logger.log(`Full diagnostic log: ${logger.getLogFile()}`);
    return false;
  }
  
  logger.log('');
  logger.log('📊 DATABASE STATISTICS:');
  await getDatabaseStats(logger);
  
  logger.log('');
  logger.log('🧪 TESTING END-TO-END PROCESSING:');
  const processingOk = await processOnePerson(logger);
  
  logger.log('');
  logger.log('🎯 FINAL DIAGNOSTIC RESULT:');
  if (processingOk) {
    logger.log('✅ ALL SYSTEMS OPERATIONAL - Ready for population');
  } else {
    logger.log('❌ PROCESSING FAILED - Check logs for details');
  }
  
  logger.log(`Full diagnostic log: ${logger.getLogFile()}`);
  logger.log('Diagnostic complete');
  
  return processingOk;
}

runDiagnostic().catch(console.error);