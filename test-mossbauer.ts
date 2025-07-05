import { db } from './server/db.ts';
import { famousPeople } from './shared/schema.ts';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';

// Initialize OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Wikipedia fetch function
async function fetchWikipediaData(wikipediaTitle: string) {
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
    
    const sectionTitles = sections.map((section: any) => section.line || section.anchor || 'Unknown').filter(Boolean);
    
    // Get biography
    const pages = contentData.query?.pages || {};
    const pageData = Object.values(pages)[0] as any;
    const biography = pageData?.extract || '';

    console.log(`📖 Successfully fetched ${sectionTitles.length} sections and biography for ${wikipediaTitle}`);
    
    return {
      sections: sectionTitles,
      biography: biography
    };
  } catch (error: any) {
    console.error(`❌ Wikipedia fetch failed: ${error.message}`);
    throw error;
  }
}

// AI hint generation function
async function generateAIHints(name: string, nationality: string, timeperiod: string, occupation: string, biography: string) {
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
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content!);
    console.log(`🤖 Successfully generated 3 AI hints for ${name}`);
    
    return [result.hint1, result.hint2, result.hint3];
  } catch (error: any) {
    console.error(`❌ AI hint generation failed: ${error.message}`);
    throw error;
  }
}

// Test function for Rudolf Mössbauer specifically
async function testMossbauerHints() {
  try {
    console.log(`🧪 TESTING RUDOLF MÖSSBAUER HINT GENERATION`);
    console.log(`==========================================\n`);
    
    // Find Rudolf Mössbauer in database
    const person = await db.select()
      .from(famousPeople)
      .where(eq(famousPeople.name, 'Rudolf Mössbauer'))
      .limit(1);
    
    if (person.length === 0) {
      console.log(`❌ Rudolf Mössbauer not found in database`);
      return;
    }
    
    const mossbauer = person[0];
    
    console.log(`👤 PERSON DATA FROM DATABASE:`);
    console.log(`   Name: ${mossbauer.name}`);
    console.log(`   Nationality: ${mossbauer.nationality}`);
    console.log(`   Time Period: ${mossbauer.timeperiod}`);
    console.log(`   Occupation: ${mossbauer.occupation}`);
    console.log(`   Category: ${mossbauer.category}`);
    console.log(`   Wikipedia Title: ${mossbauer.wikipediaTitle}`);
    console.log(`   Current Hint: ${mossbauer.hint}`);
    console.log(`   Initials: ${mossbauer.initials}`);
    console.log(`   Existing AI Hints: ${mossbauer.aiHint1 || 'None'}, ${mossbauer.aiHint2 || 'None'}, ${mossbauer.aiHint3 || 'None'}\n`);
    
    // Fetch Wikipedia data
    const wikipediaTitle = mossbauer.wikipediaTitle || mossbauer.name.replace(/ /g, '_');
    const wikipediaData = await fetchWikipediaData(wikipediaTitle);
    
    console.log(`\n📚 WIKIPEDIA DATA:`);
    console.log(`   Sections (${wikipediaData.sections.length}): ${wikipediaData.sections.join(', ')}`);
    console.log(`   Biography: ${wikipediaData.biography}\n`);
    
    // Generate AI hints
    const aiHints = await generateAIHints(
      mossbauer.name,
      mossbauer.nationality,
      mossbauer.timeperiod,
      mossbauer.occupation,
      wikipediaData.biography
    );
    
    console.log(`\n💡 NEWLY GENERATED HINTS:`);
    console.log(`   Hint 1 (General): ${aiHints[0]}`);
    console.log(`   Hint 2 (Specific): ${aiHints[1]}`);
    console.log(`   Hint 3 (Very Specific): ${aiHints[2]}`);
    
    console.log(`\n🏁 TESTING COMPLETE FOR RUDOLF MÖSSBAUER\n`);
    
  } catch (error: any) {
    console.error(`❌ Test failed: ${error.message}`);
  }
}

// Run the test
testMossbauerHints().catch(console.error);