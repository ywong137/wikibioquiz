import { db } from './server/db.ts';
import { famousPeople } from './shared/schema.ts';
import { eq, sql } from 'drizzle-orm';
import OpenAI from 'openai';

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Wikipedia fetch function (copied from production code)
async function fetchWikipediaData(wikipediaTitle) {
  console.log(`📖 Fetching Wikipedia data for: ${wikipediaTitle}`);
  
  const cleanTitle = wikipediaTitle.replace(/ /g, '_');
  console.log(`🔍 CANONICAL TITLE: ${cleanTitle} (original: ${wikipediaTitle})`);
  
  try {
    // Get page content and sections
    const [sectionsResponse, contentResponse] = await Promise.all([
      fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(cleanTitle)}&prop=sections&format=json&origin=*`),
      fetch(`https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(cleanTitle)}&prop=extracts&exintro=1&explaintext=1&origin=*`)
    ]);

    const sectionsData = await sectionsResponse.json();
    const contentData = await contentResponse.json();

    if (sectionsData.error || contentData.error) {
      throw new Error(`Wikipedia API error: ${sectionsData.error?.info || contentData.error?.info}`);
    }

    const sections = sectionsData.parse?.sections || [];
    console.log(`📋 Initial sections count: ${sections.length}`);
    
    const sectionTitles = sections.map(section => section.line || section.anchor || 'Unknown').filter(Boolean);
    
    // Get biography
    const pages = contentData.query?.pages || {};
    const pageData = Object.values(pages)[0];
    const biography = pageData?.extract || '';

    console.log(`📖 Successfully fetched ${sectionTitles.length} sections and biography for ${wikipediaTitle}`);
    
    return {
      sections: sectionTitles,
      biography: biography
    };
  } catch (error) {
    console.error(`❌ Wikipedia fetch failed: ${error.message}`);
    throw error;
  }
}

// AI hint generation function (copied from production code)
async function generateAIHints(name, nationality, timeperiod, occupation, biography) {
  console.log(`🤖 Generating AI hints for: ${name}`);
  
  const prompt = `You are creating progressive hints for a Wikipedia guessing game. Generate exactly 3 hints of increasing specificity for "${name}".

Person details:
- Name: ${name}
- Nationality: ${nationality}
- Time period: ${timeperiod}
- Occupation: ${occupation}
- Biography excerpt: ${biography.substring(0, 500)}...

Requirements:
- Hint 1: Very general (era, field, broad accomplishments)
- Hint 2: More specific (key works, events, or relationships)
- Hint 3: Very specific (unique details that almost give it away)
- Each hint should be 1-2 sentences maximum
- Never mention the person's name directly
- Make hints progressively more revealing
- Focus on facts that would help someone guess the identity

Respond in JSON format:
{
  "hint1": "...",
  "hint2": "...", 
  "hint3": "..."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content);
    console.log(`🤖 Successfully generated 3 AI hints for ${name}`);
    
    return [result.hint1, result.hint2, result.hint3];
  } catch (error) {
    console.error(`❌ AI hint generation failed: ${error.message}`);
    throw error;
  }
}

// Test function
async function testHintGeneration() {
  try {
    console.log(`🧪 TESTING AI HINT GENERATION WITH NEW PROMPT`);
    console.log(`==========================================\n`);
    
    // Get 3 random people from database
    const randomPeople = await db.select()
      .from(famousPeople)
      .where(eq(famousPeople.filteredOut, 0))
      .orderBy(sql`RANDOM()`)
      .limit(3);
    
    if (randomPeople.length === 0) {
      console.log(`❌ No people found in database`);
      return;
    }
    
    console.log(`🎯 Selected ${randomPeople.length} random people for testing:\n`);
    
    for (let i = 0; i < randomPeople.length; i++) {
      const person = randomPeople[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`TEST ${i + 1}: ${person.name}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`📊 Details: ${person.nationality} • ${person.timeperiod} • ${person.occupation}`);
      
      try {
        // Fetch Wikipedia data
        const wikipediaTitle = person.wikipediaTitle || person.name.replace(/ /g, '_');
        const wikipediaData = await fetchWikipediaData(wikipediaTitle);
        
        console.log(`📚 Biography excerpt: ${wikipediaData.biography.substring(0, 200)}...`);
        console.log(`📋 Section count: ${wikipediaData.sections.length}`);
        
        // Generate AI hints
        const aiHints = await generateAIHints(
          person.name,
          person.nationality,
          person.timeperiod,
          person.occupation,
          wikipediaData.biography
        );
        
        console.log(`\n💡 GENERATED HINTS:`);
        console.log(`   Hint 1 (General): ${aiHints[0]}`);
        console.log(`   Hint 2 (Specific): ${aiHints[1]}`);
        console.log(`   Hint 3 (Very Specific): ${aiHints[2]}`);
        
      } catch (error) {
        console.log(`❌ Failed to process ${person.name}: ${error.message}`);
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏁 TESTING COMPLETE`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}



// Run the test
testHintGeneration().catch(console.error);