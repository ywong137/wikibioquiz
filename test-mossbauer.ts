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

// AI hint generation function (COPIED EXACTLY FROM PRODUCTION server/routes.ts)
async function generateAIHints(name: string, nationality: string, timeperiod: string, occupation: string, biography: string): Promise<[string, string, string]> {
  try {
    console.log(`🤖 Generating AI hints for: ${name}`);
    
    const excerpt = biography.substring(0, 1500); // Limit to 1500 chars as per user requirement
    
    const prompt = `You are creating hints for a Wikipedia guessing game about ${name}.

Context:
- Nationality: ${nationality || 'Unknown'}
- Time period: ${timeperiod || 'Historical'}
- Occupation: ${occupation || 'Historical Figure'}
- Biography excerpt: ${excerpt}

Create exactly 3 progressive hints that help players guess this person:

HINT 1 (7→2 points): A subtle, general clue about their field or era. Don't mention birthplace, birth year, or their name.
HINT 2 (2→1 points): A more specific clue about their major achievement or what they're famous for.
HINT 3 (1→1 points): A direct clue that clearly identifies them without giving away the name.

Each hint should start with "This person was a..." or "This person is known for..." format.
Keep each hint under 50 words.
Be factual and avoid mentioning birthplace, birth year, or the person's name.

Format as JSON:
{"hint1": "...", "hint2": "...", "hint3": "..."}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use gpt-4o-mini for reliability as per user requirement
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

    console.log(`🤖 Successfully generated 3 AI hints for ${name}`);
    
    return [result.hint1, result.hint2, result.hint3];
    
  } catch (error: any) {
    console.error(`❌ AI hint generation failed for ${name}:`, error);
    throw new Error(`AI hint generation failed: ${error}`);
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