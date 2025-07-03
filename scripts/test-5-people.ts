import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { wikipediaOAuth } from './wikipedia-oauth';
import OpenAI from 'openai';
import { writeFileSync } from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Approved prompt template
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

async function generateBasicHint(person: any): Promise<string> {
  const parts = [
    person.timeperiod && person.timeperiod !== 'Unknown' ? person.timeperiod : '',
    person.nationality && person.nationality !== 'Unknown' ? person.nationality : '',
    person.occupation && person.occupation !== 'Unknown' ? person.occupation : ''
  ].filter(Boolean);
  
  return parts.join(' - ');
}

async function generateAIHints(name: string, nationality: string, timeperiod: string, occupation: string, biography: string): Promise<[string, string, string]> {
  const excerpt = biography.substring(0, 300) + (biography.length > 300 ? '...' : '');
  
  const prompt = HINT_PROMPT_TEMPLATE
    .replace('{NAME}', name)
    .replace('{NATIONALITY}', nationality || 'Unknown')
    .replace('{OCCUPATION}', occupation || 'Historical Figure')
    .replace('{TIMEPERIOD}', timeperiod || 'Historical')
    .replace('{BIOGRAPHY_EXCERPT}', excerpt);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
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
}

async function test5People() {
  console.log('Testing Wikipedia + AI processing on 5 random people...');
  
  const output: string[] = [];
  output.push('WIKIPEDIA + AI PROCESSING TEST');
  output.push('5 RANDOM PEOPLE FROM DATABASE');
  output.push(`TEST TIME: ${new Date().toLocaleString()}`);
  output.push('');
  output.push('================================================================================');
  output.push('');

  // Get 5 random people from database
  const randomPeople = await db
    .select()
    .from(famousPeople)
    .orderBy(sql`RANDOM()`)
    .limit(5);

  output.push(`Selected ${randomPeople.length} random people for testing:`);
  randomPeople.forEach((person, i) => {
    output.push(`${i + 1}. ${person.name} (${person.nationality} ${person.occupation}, ${person.timeperiod})`);
  });
  output.push('');
  output.push('================================================================================');
  output.push('');

  for (let i = 0; i < randomPeople.length; i++) {
    const person = randomPeople[i];
    
    output.push(`========== PERSON ${i + 1}/5: ${person.name} ==========`);
    console.log(`Processing ${i + 1}/5: ${person.name}`);
    
    try {
      // Step 1: Generate basic hint from database columns
      const basicHint = await generateBasicHint(person);
      output.push(`Basic Hint: ${basicHint}`);
      output.push('');

      // Step 2: Fetch Wikipedia sections
      output.push('FETCHING WIKIPEDIA SECTIONS...');
      let sections: string[] = [];
      
      try {
        sections = await wikipediaOAuth.fetchWikipediaSections(person.name);
        output.push(`✅ SUCCESS: Retrieved ${sections.length} sections`);
        
        if (sections.length < 6) {
          output.push(`⚠️ WARNING: Only ${sections.length} sections (minimum 6 recommended)`);
        }
        
        output.push('Section Headers:');
        sections.slice(0, 10).forEach((section, idx) => {
          output.push(`  ${idx + 1}. ${section}`);
        });
        if (sections.length > 10) {
          output.push(`  ... and ${sections.length - 10} more sections`);
        }
        
      } catch (error) {
        output.push(`❌ WIKIPEDIA SECTIONS FAILED: ${error}`);
        output.push('ABORTING this person due to Wikipedia failure');
        output.push('');
        continue;
      }
      
      output.push('');

      // Step 3: Fetch Wikipedia biography
      output.push('FETCHING WIKIPEDIA BIOGRAPHY...');
      let biography: string = '';
      
      try {
        biography = await wikipediaOAuth.fetchWikipediaBiography(person.name);
        output.push(`✅ SUCCESS: Retrieved biography (${biography.length} characters)`);
        
        const excerpt = biography.substring(0, 200) + (biography.length > 200 ? '...' : '');
        output.push(`Biography Excerpt: ${excerpt}`);
        
      } catch (error) {
        output.push(`❌ WIKIPEDIA BIOGRAPHY FAILED: ${error}`);
        output.push('ABORTING this person due to Wikipedia failure');
        output.push('');
        continue;
      }
      
      output.push('');

      // Step 4: Generate AI hints
      output.push('GENERATING AI HINTS...');
      
      try {
        const [hint1, hint2, hint3] = await generateAIHints(
          person.name,
          person.nationality || '',
          person.timeperiod || '',
          person.occupation || '',
          biography
        );
        
        output.push('✅ SUCCESS: Generated 3 AI hints');
        output.push(`AI Hint 1: ${hint1}`);
        output.push(`AI Hint 2: ${hint2}`);
        output.push(`AI Hint 3: ${hint3}`);
        
      } catch (error) {
        output.push(`❌ AI HINTS FAILED: ${error}`);
        output.push('ABORTING this person due to AI failure');
        output.push('');
        continue;
      }
      
      output.push('');
      output.push(`✅ COMPLETE: Successfully processed ${person.name}`);

    } catch (error) {
      output.push(`❌ UNEXPECTED ERROR: ${error}`);
    }
    
    output.push('');
    output.push('================================================================================');
    output.push('');
  }

  output.push(`TEST COMPLETED: ${new Date().toLocaleString()}`);

  writeFileSync('output5.txt', output.join('\n'));
  console.log('✅ COMPLETE - Test results written to output5.txt');
}

test5People().catch(console.error);