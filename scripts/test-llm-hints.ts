import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testLLMHints() {
  const output: string[] = [];
  
  output.push('OPENAI HINT GENERATION TEST');
  output.push('10 RANDOM PEOPLE FROM DATABASE');
  output.push(`START TIME: ${new Date().toLocaleTimeString()}`);
  output.push('');
  
  // The prompt template being sent to OpenAI
  const promptTemplate = `Generate 3 progressive hints for a Wikipedia guessing game about {NAME}.

Context: {NATIONALITY} {OCCUPATION} from the {TIMEPERIOD} period

Wikipedia Biography Excerpt: {BIOGRAPHY_EXCERPT}

Generate 3 hints that progressively reveal more information:
1. First hint: General biographical context (birthplace, era, field of work)
2. Second hint: More specific achievements or notable works  
3. Third hint: Very specific details that make them identifiable

Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}

Make the hints engaging, informative, and progressively more specific.`;

  output.push('PROMPT TEMPLATE BEING USED:');
  output.push(promptTemplate);
  output.push('');
  output.push('='.repeat(80));
  output.push('');
  
  // Get 10 truly random people
  const randomPeople = await db
    .select({ 
      name: famousPeople.name, 
      nationality: famousPeople.nationality,
      occupation: famousPeople.occupation,
      timeperiod: famousPeople.timeperiod
    })
    .from(famousPeople)
    .orderBy(sql`RANDOM()`)
    .limit(10);
  
  for (let i = 0; i < randomPeople.length; i++) {
    const person = randomPeople[i];
    
    output.push(`========== REQUEST ${i + 1}/10: ${person.name} ==========`);
    
    try {
      // Get Wikipedia biography
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(person.name)}&formatversion=2`;
      const wikiResponse = await fetch(wikiUrl);
      
      output.push(`Wikipedia Status: ${wikiResponse.status} ${wikiResponse.statusText}`);
      
      if (!wikiResponse.ok) {
        output.push(`Wikipedia Error: ${wikiResponse.status}`);
        continue;
      }
      
      const wikiData = await wikiResponse.json();
      const pages = wikiData.query?.pages || [];
      
      if (pages.length === 0 || !pages[0].extract) {
        output.push('No Wikipedia biography found');
        continue;
      }
      
      const biography = pages[0].extract;
      const biographyLength = biography.length;
      const excerpt = biography.substring(0, 300) + (biography.length > 300 ? '...' : '');
      
      output.push(`Biography Length: ${biographyLength} characters`);
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
        model: "gpt-4o-mini", // Using mini model as requested
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
      
      output.push(`OpenAI Status: Success`);
      output.push(`Model Used: gpt-4o-mini`);
      output.push(`Tokens Used: ${llmResponse.usage?.total_tokens || 'unknown'}`);
      
      const result = JSON.parse(llmResponse.choices[0].message.content || '{}');
      
      output.push('Generated Hints:');
      output.push(`  Hint 1: ${result.hint1 || 'NOT_GENERATED'}`);
      output.push(`  Hint 2: ${result.hint2 || 'NOT_GENERATED'}`);
      output.push(`  Hint 3: ${result.hint3 || 'NOT_GENERATED'}`);
      
    } catch (error) {
      output.push(`Error: ${error}`);
      if (error instanceof Error && 'status' in error) {
        output.push(`Error Status: ${(error as any).status}`);
      }
    }
    
    output.push('');
  }
  
  output.push(`END TIME: ${new Date().toLocaleTimeString()}`);
  
  // Write to file
  writeFileSync('output2.txt', output.join('\n'));
  
  console.log('✅ COMPLETE - LLM hint test data written to output2.txt');
  console.log(`📊 Processed ${randomPeople.length} random people`);
  console.log('📄 Check output2.txt for Wikipedia bios and generated hints');
}

testLLMHints().catch(console.error);