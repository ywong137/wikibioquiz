import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { wikipediaOAuth } from './wikipedia-oauth';
import OpenAI from 'openai';
import { writeFileSync } from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

async function robust5People() {
  const output: string[] = [];
  output.push('ROBUST 5 PEOPLE PROCESSING TEST');
  output.push(`START TIME: ${new Date().toLocaleString()}`);
  output.push('');

  try {
    // Get more people initially in case some need to be skipped
    const people = await db
      .select()
      .from(famousPeople)
      .orderBy(sql`RANDOM()`)
      .limit(10); // Get 10 to ensure we can process at least 5 successfully

    output.push(`Found ${people.length} candidate people`);
    output.push('');

    let processedCount = 0;
    let totalAttempted = 0;

    for (const person of people) {
      if (processedCount >= 5) break; // Stop after successfully processing 5
      
      totalAttempted++;
      output.push(`==================== ATTEMPT ${totalAttempted}: ${person.name} ====================`);
      
      try {
        // Basic info
        output.push(`Database info:`);
        output.push(`  Name: ${person.name}`);
        output.push(`  Nationality: ${person.nationality || 'Unknown'}`);
        output.push(`  Occupation: ${person.occupation || 'Unknown'}`);
        output.push(`  Time Period: ${person.timeperiod || 'Unknown'}`);
        output.push('');

        // Generate basic hint
        const parts = [
          person.timeperiod && person.timeperiod !== 'Unknown' ? person.timeperiod : '',
          person.nationality && person.nationality !== 'Unknown' ? person.nationality : '',
          person.occupation && person.occupation !== 'Unknown' ? person.occupation : ''
        ].filter(Boolean);
        const basicHint = parts.join(' - ');
        output.push(`Basic Hint: ${basicHint}`);
        output.push('');

        // Fetch Wikipedia sections
        output.push('FETCHING WIKIPEDIA SECTIONS...');
        const wikiTitle = person.wikipediaTitle || person.name;
        let sections: string[] = [];
        
        try {
          sections = await wikipediaOAuth.fetchWikipediaSections(wikiTitle);
          output.push(`Retrieved ${sections.length} sections`);
          
          if (sections.length < 6) {
            output.push(`❌ SKIPPING: Only ${sections.length} sections (minimum 6 required)`);
            output.push('Moving to next person...');
            output.push('');
            continue;
          }
          
          output.push('Section headers (first 10):');
          sections.slice(0, 10).forEach((section, idx) => {
            output.push(`  ${idx + 1}. ${section}`);
          });
          if (sections.length > 10) {
            output.push(`  ... and ${sections.length - 10} more sections`);
          }
          
        } catch (error) {
          output.push(`❌ SKIPPING: Wikipedia sections failed - ${error}`);
          output.push('Moving to next person...');
          output.push('');
          continue;
        }
        output.push('');

        // Fetch Wikipedia biography
        output.push('FETCHING WIKIPEDIA BIOGRAPHY...');
        let biography: string = '';
        try {
          biography = await wikipediaOAuth.fetchWikipediaBiography(wikiTitle);
          output.push(`Retrieved biography (${biography.length} characters)`);
          
          const excerpt = biography.substring(0, 200) + (biography.length > 200 ? '...' : '');
          output.push(`Excerpt: ${excerpt}`);
          
        } catch (error) {
          output.push(`❌ SKIPPING: Wikipedia biography failed - ${error}`);
          output.push('Moving to next person...');
          output.push('');
          continue;
        }
        output.push('');

        // Generate AI hints
        output.push('GENERATING AI HINTS...');
        try {
          const excerpt = biography.substring(0, 300) + (biography.length > 300 ? '...' : '');
          
          const prompt = HINT_PROMPT_TEMPLATE
            .replace('{NAME}', person.name)
            .replace('{NATIONALITY}', person.nationality || 'Unknown')
            .replace('{OCCUPATION}', person.occupation || 'Historical Figure')
            .replace('{TIMEPERIOD}', person.timeperiod || 'Historical')
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
            throw new Error('OpenAI response missing required hints');
          }

          output.push(`✅ Generated 3 AI hints (${response.usage?.total_tokens || 'unknown'} tokens)`);
          output.push(`AI Hint 1: ${result.hint1}`);
          output.push(`AI Hint 2: ${result.hint2}`);
          output.push(`AI Hint 3: ${result.hint3}`);
          
        } catch (error) {
          output.push(`❌ SKIPPING: AI hints failed - ${error}`);
          output.push('Moving to next person...');
          output.push('');
          continue;
        }

        // Success!
        processedCount++;
        output.push('');
        output.push(`🎉 SUCCESS ${processedCount}/5: ${person.name} processed completely`);
        output.push('NOTE: Database was NOT updated (test mode)');
        output.push('');
        output.push('================================================================================');
        output.push('');

      } catch (error) {
        output.push(`❌ UNEXPECTED ERROR for ${person.name}: ${error}`);
        output.push('Moving to next person...');
        output.push('');
      }
    }

    output.push(`FINAL SUMMARY:`);
    output.push(`Successfully processed: ${processedCount}/5 people`);
    output.push(`Total attempts: ${totalAttempted}`);
    output.push(`Success rate: ${Math.round((processedCount / totalAttempted) * 100)}%`);

  } catch (error) {
    output.push(`❌ CRITICAL ERROR: ${error}`);
  }

  output.push('');
  output.push(`END TIME: ${new Date().toLocaleString()}`);

  writeFileSync('output7.txt', output.join('\n'));
  console.log(`✅ Test complete - Processed ${processedCount || 0}/5 people - Results in output7.txt`);
}

robust5People().catch(console.error);