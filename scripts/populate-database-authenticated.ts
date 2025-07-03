import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { wikipediaOAuth } from './wikipedia-oauth';
import OpenAI from 'openai';
import { writeFileSync } from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Load the approved prompt template
const HINT_PROMPT_TEMPLATE = `Generate 3 progressive hints for a Wikipedia guessing game about {NAME}.

Context: {NATIONALITY} {OCCUPATION} from the {TIMEPERIOD} period

Wikipedia Biography Excerpt: {BIOGRAPHY_EXCERPT}

Generate 3 hints that progressively reveal more information:
1. First hint: Start with "This person was a..." and describe their field of work. DO NOT mention birthplace or birth year.
2. Second hint: More specific achievements or notable works  
3. Third hint: Very specific details that make them identifiable

IMPORTANT RULES:
- Never use the person's name (including first name) in any hint
- Refer to them as "he", "she", or "this person" as appropriate
- Do not mention birthplace or birth year in any hint
- Focus on their work, achievements, and contributions

Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}`;

interface ProcessingStats {
  total: number;
  processed: number;
  wikipediaFailed: number;
  openaiEailed: number;
  success: number;
}

async function generateBasicHint(person: any): Promise<string> {
  const parts = [
    person.nationality && person.nationality !== 'Unknown' ? person.nationality : '',
    person.timeperiod && person.timeperiod !== 'Unknown' ? person.timeperiod.toLowerCase() : '',
    person.occupation && person.occupation !== 'Unknown' ? person.occupation.toLowerCase() : ''
  ].filter(Boolean);
  
  return parts.length > 0 ? parts.join(' ') : 'Historical figure';
}

async function generateAIHints(name: string, nationality: string, timeperiod: string, occupation: string, biography: string): Promise<[string, string, string]> {
  try {
    const excerpt = biography.substring(0, 300) + (biography.length > 300 ? '...' : '');
    
    const prompt = HINT_PROMPT_TEMPLATE
      .replace('{NAME}', name)
      .replace('{NATIONALITY}', nationality || 'Unknown')
      .replace('{OCCUPATION}', occupation || 'Historical Figure')
      .replace('{TIMEPERIOD}', timeperiod || 'Historical')
      .replace('{BIOGRAPHY_EXCERPT}', excerpt);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert at creating engaging, educational biographical hints for a Wikipedia guessing game."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.7
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    if (!result.hint1 || !result.hint2 || !result.hint3) {
      throw new Error('Invalid hint response from OpenAI');
    }

    return [result.hint1, result.hint2, result.hint3];
    
  } catch (error) {
    throw new Error(`AI hint generation failed: ${error}`);
  }
}

async function processOnePerson(person: any, stats: ProcessingStats): Promise<boolean> {
  try {
    // Fetch Wikipedia sections
    let sections: string[] = [];
    try {
      sections = await wikipediaOAuth.fetchWikipediaSections(person.name);
      if (sections.length < 6) {
        // Skip people with insufficient biographical content
        console.log(`⚠️ Skipping ${person.name} - only ${sections.length} sections (minimum 6 required)`);
        return false;
      }
    } catch (error) {
      stats.wikipediaFailed++;
      throw new Error(`Wikipedia sections failed: ${error}`);
    }

    // Fetch Wikipedia biography
    let biography: string = '';
    try {
      biography = await wikipediaOAuth.fetchWikipediaBiography(person.name);
      if (!biography || biography.length < 100) {
        throw new Error('Biography too short or missing');
      }
    } catch (error) {
      stats.wikipediaFailed++;
      throw new Error(`Wikipedia biography failed: ${error}`);
    }

    // Generate basic hint
    const basicHint = await generateBasicHint(person);

    // Generate AI hints
    let aiHints: [string, string, string];
    try {
      aiHints = await generateAIHints(
        person.name,
        person.nationality || '',
        person.timeperiod || '',
        person.occupation || '',
        biography
      );
    } catch (error) {
      stats.openaiEailed++;
      throw new Error(`AI hints failed: ${error}`);
    }

    // Update database with all the data
    await db
      .update(famousPeople)
      .set({
        sections: sections,
        hint: basicHint,
        ai_hint_1: aiHints[0],
        ai_hint_2: aiHints[1],
        ai_hint_3: aiHints[2],
        processed_at: new Date()
      })
      .where(eq(famousPeople.id, person.id));

    stats.success++;
    return true;

  } catch (error) {
    console.error(`❌ Failed to process ${person.name}: ${error}`);
    return false;
  }
}

async function populateDatabaseAuthenticated() {
  console.log('Starting authenticated Wikipedia + AI database population...');
  
  const stats: ProcessingStats = {
    total: 0,
    processed: 0,
    wikipediaFailed: 0,
    openaiEailed: 0,
    success: 0
  };

  // Get people that need processing (no sections data)
  const peopleToProcess = await db
    .select()
    .from(famousPeople)
    .where(isNull(famousPeople.sections))
    .limit(100); // Process 100 at a time for efficiency

  stats.total = peopleToProcess.length;
  console.log(`Found ${stats.total} people to process`);

  if (stats.total === 0) {
    console.log('✅ All people already processed!');
    return;
  }

  const logLines: string[] = [];
  logLines.push(`AUTHENTICATED WIKIPEDIA + AI POPULATION`);
  logLines.push(`START TIME: ${new Date().toLocaleString()}`);
  logLines.push(`PROCESSING: ${stats.total} people`);
  logLines.push('');

  for (let i = 0; i < peopleToProcess.length; i++) {
    const person = peopleToProcess[i];
    stats.processed++;
    
    console.log(`Processing ${stats.processed}/${stats.total}: ${person.name}`);
    
    const success = await processOnePerson(person, stats);
    
    if (success) {
      logLines.push(`✅ ${person.name} - SUCCESS`);
    } else {
      logLines.push(`❌ ${person.name} - FAILED`);
    }

    // Progress update every 10 people
    if (stats.processed % 10 === 0) {
      const progress = Math.round((stats.processed / stats.total) * 100);
      console.log(`📊 Progress: ${stats.processed}/${stats.total} (${progress}%) - Success: ${stats.success}`);
    }

    // Small delay to be respectful to APIs
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  logLines.push('');
  logLines.push('FINAL STATISTICS:');
  logLines.push(`Total processed: ${stats.processed}`);
  logLines.push(`Successful: ${stats.success}`);
  logLines.push(`Wikipedia failures: ${stats.wikipediaFailed}`);
  logLines.push(`OpenAI failures: ${stats.openaiEailed}`);
  logLines.push(`Success rate: ${Math.round((stats.success / stats.processed) * 100)}%`);
  logLines.push(`END TIME: ${new Date().toLocaleString()}`);

  writeFileSync('population-log.txt', logLines.join('\n'));
  
  console.log(`🎉 COMPLETE: ${stats.success}/${stats.processed} people processed successfully`);
  console.log(`📝 Detailed log written to population-log.txt`);
}

populateDatabaseAuthenticated().catch(console.error);