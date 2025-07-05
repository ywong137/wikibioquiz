import { db } from './server/db';
import { famousPeople } from './shared/schema';
import { eq } from 'drizzle-orm';

// Import the actual production function from server/routes.ts
// We'll extract it since it's not exported
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// EXACT COPY of generateAIHints function from server/routes.ts (lines 1510-1568)
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

// Wikipedia fetch function (also from server/routes.ts)
async function fetchWikipediaData(wikipediaTitle: string) {
  try {
    console.log(`📖 Fetching Wikipedia data for: ${wikipediaTitle}`);
    
    // Get canonical title
    const canonicalUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikipediaTitle)}&redirects=1&format=json&origin=*`;
    const canonicalResponse = await fetch(canonicalUrl);
    const canonicalData = await canonicalResponse.json();
    
    let finalTitle = wikipediaTitle;
    if (canonicalData.query?.pages) {
      const pageId = Object.keys(canonicalData.query.pages)[0];
      if (pageId !== '-1') {
        finalTitle = canonicalData.query.pages[pageId].title;
        console.log(`🔍 CANONICAL TITLE: ${finalTitle} (original: ${wikipediaTitle})`);
      }
    }
    
    // Fetch sections
    const sectionsUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(finalTitle)}&prop=sections&format=json&origin=*`;
    const sectionsResponse = await fetch(sectionsUrl);
    const sectionsData = await sectionsResponse.json();
    
    let sections: string[] = [];
    if (sectionsData.parse && sectionsData.parse.sections) {
      sections = sectionsData.parse.sections
        .filter((section: any) => section.toclevel === 1 && section.line)
        .map((section: any) => section.line)
        .filter((title: string) => 
          !title.toLowerCase().includes('reference') && 
          !title.toLowerCase().includes('external') &&
          !title.toLowerCase().includes('see also') &&
          !title.toLowerCase().includes('bibliography')
        )
        .slice(0, 8);
    }
    
    console.log(`📋 Initial sections count: ${sections.length}`);
    
    // Fetch biography
    const bioUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(finalTitle)}&prop=extracts&exintro=true&format=json&origin=*`;
    const bioResponse = await fetch(bioUrl);
    const bioData = await bioResponse.json();
    
    let biography = '';
    if (bioData.query?.pages) {
      const pageId = Object.keys(bioData.query.pages)[0];
      if (pageId !== '-1') {
        biography = bioData.query.pages[pageId].extract || '';
        biography = biography.replace(/<[^>]*>/g, ''); // Remove HTML tags
      }
    }
    
    console.log(`📖 Successfully fetched ${sections.length} sections and biography for ${wikipediaTitle}`);
    
    return { sections, biography };
  } catch (error: any) {
    console.error(`❌ Wikipedia fetch failed for ${wikipediaTitle}:`, error);
    throw error;
  }
}

async function testRudolfMossbauer() {
  console.log('\n🧪 TESTING RUDOLF MÖSSBAUER WITH PRODUCTION TEMPLATE');
  console.log('=====================================================\n');
  
  try {
    // Get person from database
    const person = await db.select().from(famousPeople).where(eq(famousPeople.name, 'Rudolf Mössbauer')).limit(1);
    
    if (person.length === 0) {
      console.log('❌ Rudolf Mössbauer not found in database');
      return;
    }
    
    const rudolfData = person[0];
    console.log('👤 PERSON DATA FROM DATABASE:');
    console.log(`   Name: ${rudolfData.name}`);
    console.log(`   Nationality: ${rudolfData.nationality}`);
    console.log(`   Time Period: ${rudolfData.timeperiod}`);
    console.log(`   Occupation: ${rudolfData.occupation}`);
    console.log(`   Wikipedia Title: ${rudolfData.wikipediaTitle}`);
    console.log(`   Initials: ${rudolfData.initials}`);
    console.log('');
    
    // Fetch Wikipedia data
    const wikipediaData = await fetchWikipediaData(rudolfData.wikipediaTitle!);
    
    console.log('📚 WIKIPEDIA DATA:');
    console.log(`   Sections (${wikipediaData.sections.length}): ${wikipediaData.sections.join(', ')}`);
    console.log(`   Biography: ${wikipediaData.biography.substring(0, 200)}...`);
    console.log('');
    
    // Generate AI hints using the EXACT production function
    const [hint1, hint2, hint3] = await generateAIHints(
      rudolfData.name,
      rudolfData.nationality || 'Unknown',
      rudolfData.timeperiod || 'Historical',
      rudolfData.occupation || 'Historical Figure',
      wikipediaData.biography
    );
    
    console.log('💡 PRODUCTION TEMPLATE RESULTS:');
    console.log(`   Hint 1 (General): ${hint1}`);
    console.log(`   Hint 2 (Specific): ${hint2}`);
    console.log(`   Hint 3 (Very Specific): ${hint3}`);
    console.log('');
    
    console.log('🏁 TESTING COMPLETE - USING PRODUCTION server/routes.ts generateAIHints FUNCTION');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testRudolfMossbauer().catch(console.error);