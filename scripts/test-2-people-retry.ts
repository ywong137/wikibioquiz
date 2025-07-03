import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { wikipediaOAuth } from './wikipedia-oauth';
import OpenAI from 'openai';
import { writeFileSync } from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function log(message: string, toFile: boolean = true) {
  const timestamp = new Date().toLocaleString();
  const logMessage = `[${timestamp}] ${message}`;
  
  console.log(logMessage);
  
  if (toFile) {
    try {
      writeFileSync('output7.txt', logMessage + '\n', { flag: 'a' });
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWikipediaWithRetry(personName: string, maxRetries: number = 3): Promise<string[] | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log(`Attempt ${attempt}/${maxRetries}: Fetching Wikipedia sections for ${personName}...`);
      
      const sections = await wikipediaOAuth.fetchWikipediaSections(personName);
      
      log(`Wikipedia returned ${sections.length} sections`);
      
      if (sections.length === 0) {
        log(`❌ Wikipedia call returned 0 sections (bad call) - attempt ${attempt}/${maxRetries}`);
        if (attempt < maxRetries) {
          log(`Waiting 1 second before retry...`);
          await sleep(1000);
          continue;
        } else {
          log(`❌ All ${maxRetries} attempts failed - giving up on ${personName}`);
          return null;
        }
      }
      
      log(`✅ Successfully retrieved ${sections.length} sections for ${personName}`);
      return sections;
      
    } catch (error) {
      log(`❌ Wikipedia API error on attempt ${attempt}/${maxRetries}: ${error}`);
      if (attempt < maxRetries) {
        log(`Waiting 1 second before retry...`);
        await sleep(1000);
      } else {
        log(`❌ All ${maxRetries} attempts failed with errors - giving up on ${personName}`);
        return null;
      }
    }
  }
  
  return null;
}

async function test2PeopleRetry() {
  // Clear output file
  writeFileSync('output7.txt', '');
  
  log('='.repeat(60));
  log('TEST: 2 PEOPLE WITH RETRY LOGIC');
  log('='.repeat(60));
  log('');
  
  try {
    // Get 2 random people
    const people = await db
      .select()
      .from(famousPeople)
      .orderBy(sql`RANDOM()`)
      .limit(2);
    
    log(`Selected ${people.length} people for processing:`);
    people.forEach((person, i) => {
      log(`  ${i + 1}. ${person.name} (${person.nationality}, ${person.occupation})`);
    });
    log('');
    
    for (let i = 0; i < people.length; i++) {
      const person = people[i];
      
      log(`${'='.repeat(40)}`);
      log(`PROCESSING PERSON ${i + 1}/2: ${person.name}`);
      log(`${'='.repeat(40)}`);
      
      // Fetch Wikipedia sections with retry
      const sections = await fetchWikipediaWithRetry(person.name);
      
      if (sections === null) {
        log(`❌ FAILED: Could not retrieve Wikipedia sections for ${person.name} after retries`);
        log(`Breaking out of loop - script terminating`);
        log('');
        break;
      }
      
      log(`Wikipedia sections (${sections.length} total):`);
      sections.slice(0, 10).forEach((section, idx) => {
        log(`  ${idx + 1}. ${section}`);
      });
      if (sections.length > 10) {
        log(`  ... and ${sections.length - 10} more sections`);
      }
      log('');
      
      // Check if we have enough sections
      if (sections.length < 6) {
        log(`⚠️ WARNING: Only ${sections.length} sections (minimum 6 required)`);
        log(`Skipping LLM calls for ${person.name} due to insufficient content`);
      } else {
        log(`✅ Sufficient sections (${sections.length} >= 6) - proceeding with LLM calls`);
        
        // Fetch Wikipedia biography
        try {
          log(`Fetching Wikipedia biography for ${person.name}...`);
          const biography = await wikipediaOAuth.fetchWikipediaBiography(person.name);
          log(`✅ Retrieved biography (${biography.length} characters)`);
          
          // Generate AI hints
          log(`Generating AI hints for ${person.name}...`);
          const prompt = `Generate 3 progressive hints for a Wikipedia guessing game about ${person.name}.

Context: ${person.nationality} ${person.occupation} from the ${person.timeperiod} period

Generate 3 hints that progressively reveal more information:
1. First hint: Start with "This person was a..." and describe their field of work. DO NOT mention birthplace or birth year.
2. Second hint: More specific achievements or notable works  
3. Third hint: Very specific details that make them identifiable

IMPORTANT RULES:
- Never use the person's name in any hint
- Refer to them as "he", "she", or "this person" as appropriate
- Do not mention birthplace or birth year in any hint
- Focus on their work, achievements, and contributions

Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}`;

          const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            max_tokens: 500
          });
          
          const hints = JSON.parse(response.choices[0].message.content || '{}');
          log(`✅ Generated AI hints (${response.usage?.total_tokens || 'unknown'} tokens):`);
          log(`  Hint 1: ${hints.hint1}`);
          log(`  Hint 2: ${hints.hint2}`);
          log(`  Hint 3: ${hints.hint3}`);
          
        } catch (error) {
          log(`❌ Failed to generate AI hints for ${person.name}: ${error}`);
        }
      }
      
      log('');
      if (i < people.length - 1) {
        log(`Waiting 1 second before next person...`);
        await sleep(1000);
        log('');
      }
    }
    
    log('='.repeat(60));
    log('✅ SCRIPT COMPLETED SUCCESSFULLY');
    log('='.repeat(60));
    
  } catch (error) {
    log(`❌ CRITICAL ERROR: ${error}`);
    log(`Stack trace: ${error.stack || 'No stack trace'}`);
  }
  
  log(`Script finished at ${new Date().toLocaleString()}`);
}

test2PeopleRetry().catch((error) => {
  log(`❌ SCRIPT FAILED: ${error}`);
  log(`Stack trace: ${error.stack || 'No stack trace'}`);
});