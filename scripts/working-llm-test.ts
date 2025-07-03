import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function workingLLMTest() {
  console.log('Starting LLM hint test...');
  
  const output: string[] = [];
  output.push('OPENAI HINT GENERATION TEST');
  output.push('3 RANDOM PEOPLE FROM DATABASE');
  output.push(`START TIME: ${new Date().toLocaleTimeString()}`);
  output.push('');
  
  const promptTemplate = `Generate 3 progressive hints for a Wikipedia guessing game about {NAME}.

Context: {NATIONALITY} {OCCUPATION} from the {TIMEPERIOD} period

Wikipedia Biography Excerpt: {BIOGRAPHY_EXCERPT}

Generate 3 hints that progressively reveal more information:
1. First hint: General biographical context (birthplace, era, field of work)
2. Second hint: More specific achievements or notable works  
3. Third hint: Very specific details that make them identifiable

Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}`;

  output.push('PROMPT TEMPLATE:');
  output.push(promptTemplate);
  output.push('');
  output.push('================================================================================');
  output.push('');
  
  const randomPeople = await db
    .select({ 
      name: famousPeople.name, 
      nationality: famousPeople.nationality,
      occupation: famousPeople.occupation,
      timeperiod: famousPeople.timeperiod
    })
    .from(famousPeople)
    .orderBy(sql`RANDOM()`)
    .limit(3); // Just 3 for reliability
  
  for (let i = 0; i < randomPeople.length; i++) {
    const person = randomPeople[i];
    
    output.push(`========== PERSON ${i + 1}/3: ${person.name} ==========`);
    console.log(`Processing ${i + 1}/3: ${person.name}`);
    
    try {
      // Get Wikipedia biography
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(person.name)}&formatversion=2`;
      const wikiResponse = await fetch(wikiUrl);
      
      output.push(`Wikipedia Status: ${wikiResponse.status} ${wikiResponse.statusText}`);
      
      if (!wikiResponse.ok) {
        output.push(`ERROR: Wikipedia request failed`);
        continue;
      }
      
      const wikiData = await wikiResponse.json();
      const pages = wikiData.query?.pages || [];
      
      if (pages.length === 0 || !pages[0].extract) {
        output.push('ERROR: No Wikipedia biography found');
        continue;
      }
      
      const biography = pages[0].extract;
      const excerpt = biography.substring(0, 300) + (biography.length > 300 ? '...' : '');
      
      output.push(`Biography Length: ${biography.length} characters`);
      output.push(`Biography Excerpt: ${excerpt}`);
      output.push('');
      
      // Generate hints with OpenAI
      const prompt = promptTemplate
        .replace('{NAME}', person.name)
        .replace('{NATIONALITY}', person.nationality || 'Unknown')
        .replace('{OCCUPATION}', person.occupation || 'Historical Figure')
        .replace('{TIMEPERIOD}', person.timeperiod || 'Historical')
        .replace('{BIOGRAPHY_EXCERPT}', excerpt);
      
      const llmResponse = await openai.chat.completions.create({
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
      
      output.push(`OpenAI Status: SUCCESS`);
      output.push(`Model: gpt-4o-mini`);
      output.push(`Tokens: ${llmResponse.usage?.total_tokens || 'unknown'}`);
      
      const result = JSON.parse(llmResponse.choices[0].message.content || '{}');
      
      output.push('');
      output.push('GENERATED HINTS:');
      output.push(`  Hint 1: ${result.hint1 || 'FAILED_TO_GENERATE'}`);
      output.push(`  Hint 2: ${result.hint2 || 'FAILED_TO_GENERATE'}`);
      output.push(`  Hint 3: ${result.hint3 || 'FAILED_TO_GENERATE'}`);
      
    } catch (error) {
      output.push(`ERROR: ${error}`);
    }
    
    output.push('');
  }
  
  output.push(`END TIME: ${new Date().toLocaleTimeString()}`);
  
  writeFileSync('output2.txt', output.join('\n'));
  console.log('✅ COMPLETE - Full LLM test data written to output2.txt');
}

workingLLMTest().catch(console.error);