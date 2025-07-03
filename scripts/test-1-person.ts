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

async function test5People() {
  const output: string[] = [];
  output.push('FIVE PEOPLE PROCESSING TEST');
  output.push(`START TIME: ${new Date().toLocaleString()}`);
  output.push('');

  try {
    // Get 5 random people from database
    const people = await db
      .select()
      .from(famousPeople)
      .orderBy(sql`RANDOM()`)
      .limit(5);

    if (people.length === 0) {
      output.push('❌ ERROR: No people found in database');
      writeFileSync('output7.txt', output.join('\n'));
      return;
    }

    output.push(`Found ${people.length} people to process`);
    output.push('');

    for (let i = 0; i < people.length; i++) {
      const person = people[i];
      
      output.push(`==================== PERSON ${i + 1}/${people.length}: ${person.name} ====================`);
      output.push('');

    output.push(`SELECTED PERSON: ${person.name}`);
    output.push(`Database info:`);
    output.push(`  ID: ${person.id}`);
    output.push(`  Name: ${person.name}`);
    output.push(`  Nationality: ${person.nationality || 'Unknown'}`);
    output.push(`  Occupation: ${person.occupation || 'Unknown'}`);
    output.push(`  Time Period: ${person.timeperiod || 'Unknown'}`);
    output.push(`  Wikipedia Title: ${person.wikipediaTitle || person.name}`);
    output.push('');

    // Step 1: Generate basic hint from database columns
    output.push('STEP 1: GENERATING BASIC HINT...');
    const parts = [
      person.timeperiod && person.timeperiod !== 'Unknown' ? person.timeperiod : '',
      person.nationality && person.nationality !== 'Unknown' ? person.nationality : '',
      person.occupation && person.occupation !== 'Unknown' ? person.occupation : ''
    ].filter(Boolean);
    
    const basicHint = parts.join(' - ');
    output.push(`✅ Basic Hint: ${basicHint}`);
    output.push('');

    // Step 2: Fetch Wikipedia sections
    output.push('STEP 2: FETCHING WIKIPEDIA SECTIONS...');
    const wikiTitle = person.wikipediaTitle || person.name;
    output.push(`Using Wikipedia title: ${wikiTitle}`);
    
    let sections: string[] = [];
    try {
      sections = await wikipediaOAuth.fetchWikipediaSections(wikiTitle);
      output.push(`✅ SUCCESS: Retrieved ${sections.length} sections`);
      
      if (sections.length < 6) {
        output.push(`⚠️ WARNING: Only ${sections.length} sections (minimum 6 recommended)`);
      }
      
      output.push('All Section Headers:');
      sections.forEach((section, idx) => {
        output.push(`  ${idx + 1}. ${section}`);
      });
      
    } catch (error) {
      output.push(`❌ WIKIPEDIA SECTIONS FAILED: ${error}`);
      output.push('Cannot continue without sections data');
      writeFileSync('output5.txt', output.join('\n'));
      return;
    }
    output.push('');

    // Step 3: Fetch Wikipedia biography
    output.push('STEP 3: FETCHING WIKIPEDIA BIOGRAPHY...');
    let biography: string = '';
    try {
      biography = await wikipediaOAuth.fetchWikipediaBiography(wikiTitle);
      output.push(`✅ SUCCESS: Retrieved biography (${biography.length} characters)`);
      
      const excerpt = biography.substring(0, 300) + (biography.length > 300 ? '...' : '');
      output.push('Biography Excerpt (first 300 chars):');
      output.push(`"${excerpt}"`);
      
    } catch (error) {
      output.push(`❌ WIKIPEDIA BIOGRAPHY FAILED: ${error}`);
      output.push('Cannot continue without biography data');
      writeFileSync('output5.txt', output.join('\n'));
      return;
    }
    output.push('');

    // Step 4: Generate AI hints
    output.push('STEP 4: GENERATING AI HINTS...');
    try {
      const excerpt = biography.substring(0, 300) + (biography.length > 300 ? '...' : '');
      
      const prompt = HINT_PROMPT_TEMPLATE
        .replace('{NAME}', person.name)
        .replace('{NATIONALITY}', person.nationality || 'Unknown')
        .replace('{OCCUPATION}', person.occupation || 'Historical Figure')
        .replace('{TIMEPERIOD}', person.timeperiod || 'Historical')
        .replace('{BIOGRAPHY_EXCERPT}', excerpt);

      output.push('Sending prompt to OpenAI...');
      output.push('Model: gpt-4o-mini');
      output.push('');

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
        throw new Error('OpenAI response missing required hints');
      }

      output.push('✅ SUCCESS: Generated 3 AI hints');
      output.push(`Tokens used: ${response.usage?.total_tokens || 'unknown'}`);
      output.push('');
      output.push('GENERATED HINTS:');
      output.push(`AI Hint 1: ${result.hint1}`);
      output.push(`AI Hint 2: ${result.hint2}`);
      output.push(`AI Hint 3: ${result.hint3}`);
      
    } catch (error) {
      output.push(`❌ AI HINTS FAILED: ${error}`);
      output.push('Continuing to next person...');
    }
    output.push('');

    output.push('🎉 COMPLETE: Successfully processed all steps for ' + person.name);
    output.push('NOTE: Database was NOT updated (test mode)');
    output.push('');
    output.push('================================================================================');
    output.push('');
    }

  } catch (error) {
    output.push(`❌ UNEXPECTED ERROR: ${error}`);
  }

  output.push('');
  output.push(`END TIME: ${new Date().toLocaleString()}`);

  writeFileSync('output7.txt', output.join('\n'));
  console.log('✅ Test complete - Results written to output7.txt');
}

test5People().catch(console.error);