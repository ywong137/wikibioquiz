import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { wikipediaOAuth } from './wikipedia-oauth';
import OpenAI from 'openai';
import { writeFileSync } from 'fs';

// No global OpenAI instance - create fresh instance for each request

function log(message: string, toFile: boolean = true) {
  const timestamp = new Date().toLocaleString();
  const logMessage = `[${timestamp}] ${message}`;
  
  console.log(logMessage);
  
  if (toFile) {
    try {
      writeFileSync('output4.txt', logMessage + '\n', { flag: 'a' });
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
  writeFileSync('output4.txt', '');
  
  log('='.repeat(60));
  log('TEST: 4 PEOPLE WITH FRESH OPENAI INSTANCES');
  log('='.repeat(60));
  log('');
  
  try {
    // Get 4 random people
    const people = await db
      .select()
      .from(famousPeople)
      .orderBy(sql`RANDOM()`)
      .limit(4);
    
    log(`Selected ${people.length} people for processing:`);
    people.forEach((person, i) => {
      log(`  ${i + 1}. ${person.name} (${person.nationality}, ${person.occupation})`);
    });
    log('');
    
    for (let i = 0; i < people.length; i++) {
      const person = people[i];
      
      log(`${'='.repeat(40)}`);
      log(`PROCESSING PERSON ${i + 1}/4: ${person.name}`);
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
      
      // Check if we have any sections
      if (sections.length < 1) {
        log(`⚠️ WARNING: Only ${sections.length} sections - this should not happen after retry logic`);
        log(`Skipping LLM calls for ${person.name} due to no content`);
      } else {
        log(`✅ Have sections (${sections.length} > 0) - proceeding with LLM calls`);
        
        // Fetch Wikipedia biography
        try {
          log(`Fetching Wikipedia biography for ${person.name}...`);
          const biography = await wikipediaOAuth.fetchWikipediaBiography(person.name);
          log(`✅ Retrieved biography (${biography.length} characters)`);
          
          // Generate AI hints
          log(`Generating AI hints for ${person.name}...`);
          
          // Limit biography to 1500 characters to reduce prompt complexity
          const limitedBiography = biography.substring(0, 1500) + (biography.length > 1500 ? '...' : '');
          log(`Using biography excerpt (${limitedBiography.length} characters)`);
          
          const prompt = `Generate 3 progressive hints for a Wikipedia guessing game about ${person.name}.

Context: ${person.nationality} ${person.occupation} from the ${person.timeperiod} period

Biography excerpt: ${limitedBiography}

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

          // Try OpenAI with FRESH INSTANCE for each attempt and timeout logic
          let response;
          let hints;
          
          for (let llmAttempt = 1; llmAttempt <= 3; llmAttempt++) {
            try {
              log(`🔄 LLM attempt ${llmAttempt}/3: Creating FRESH OpenAI instance...`);
              
              // Create a completely fresh OpenAI client for this attempt
              const freshOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
              log(`✅ Fresh OpenAI instance created for attempt ${llmAttempt}`);
              
              log(`⏱️  Starting OpenAI request with 1 second timeout...`);
              
              // Create timeout promise
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                  log(`⏰ TIMEOUT: 1 second elapsed - abandoning this OpenAI instance`);
                  reject(new Error('OpenAI request timeout after 1 second'));
                }, 1000);
              });
              
              // Create OpenAI request promise with fresh instance
              const openaiPromise = freshOpenAI.chat.completions.create({
                model: "gpt-4.1-nano-2025-04-14",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                max_tokens: 500
              });
              
              log(`🏃 Racing timeout vs OpenAI response...`);
              
              // Race between timeout and OpenAI response
              response = await Promise.race([openaiPromise, timeoutPromise]);
              
              log(`🎯 OpenAI responded successfully within timeout!`);
              
              hints = JSON.parse(response.choices[0].message.content || '{}');
              log(`✅ Generated AI hints (${response.usage?.total_tokens || 'unknown'} tokens) on attempt ${llmAttempt}:`);
              log(`  Hint 1: ${hints.hint1}`);
              log(`  Hint 2: ${hints.hint2}`);
              log(`  Hint 3: ${hints.hint3}`);
              
              log(`🧹 Fresh OpenAI instance completed successfully - will be garbage collected`);
              break; // Success, exit retry loop
              
            } catch (error) {
              log(`❌ LLM attempt ${llmAttempt}/3 FAILED: ${error.message}`);
              log(`🗑️  Abandoning hung OpenAI instance from attempt ${llmAttempt} (will remain in background)`);
              
              if (llmAttempt === 3) {
                log(`🚨🚨 CRITICAL FAILURE: All 3 fresh OpenAI instances failed with timeouts/errors!`);
                log(`🚨🚨 This indicates a systematic problem with OpenAI API or our approach!`);
                log(`🚨🚨 STOPPING SCRIPT - Cannot proceed with unreliable OpenAI responses`);
                throw new Error(`All 3 fresh OpenAI instances failed: ${error.message}`);
              }
              
              log(`⏳ Waiting 1 second before creating next fresh instance...`);
              await sleep(1000);
            }
          }
          
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