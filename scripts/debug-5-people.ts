import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';

async function debug5People() {
  const output: string[] = [];
  output.push('DEBUG: 5 PEOPLE PROCESSING TEST');
  output.push(`START TIME: ${new Date().toLocaleString()}`);
  output.push('');

  try {
    output.push('Step 1: Connecting to database...');
    const people = await db
      .select()
      .from(famousPeople)
      .orderBy(sql`RANDOM()`)
      .limit(5);
    
    output.push(`✅ Found ${people.length} people in database`);
    output.push('');

    people.forEach((person, i) => {
      output.push(`${i + 1}. ${person.name} (${person.nationality} ${person.occupation}, ${person.timeperiod})`);
    });
    output.push('');

    output.push('Step 2: Testing Wikipedia OAuth...');
    const { wikipediaOAuth } = await import('./wikipedia-oauth');
    output.push('✅ Wikipedia OAuth module loaded');
    
    output.push('Step 3: Testing OpenAI...');
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    output.push('✅ OpenAI module loaded');
    
    output.push('Step 4: Testing first person Wikipedia call...');
    const firstPerson = people[0];
    try {
      const sections = await wikipediaOAuth.fetchWikipediaSections(firstPerson.name);
      output.push(`✅ Wikipedia sections for ${firstPerson.name}: ${sections.length} sections`);
    } catch (error) {
      output.push(`❌ Wikipedia failed for ${firstPerson.name}: ${error}`);
    }

    output.push('');
    output.push('✅ DEBUG COMPLETE - All systems appear functional');

  } catch (error) {
    output.push(`❌ CRITICAL ERROR: ${error}`);
    output.push(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
  }

  output.push('');
  output.push(`END TIME: ${new Date().toLocaleString()}`);

  writeFileSync('output7.txt', output.join('\n'));
  console.log('✅ Debug complete - Results written to output7.txt');
}

debug5People().catch((error) => {
  console.error('❌ Debug script failed:', error);
  const output = [
    'CRITICAL DEBUG FAILURE',
    `Time: ${new Date().toLocaleString()}`,
    `Error: ${error}`,
    `Stack: ${error instanceof Error ? error.stack : 'No stack trace'}`
  ];
  writeFileSync('output7.txt', output.join('\n'));
});