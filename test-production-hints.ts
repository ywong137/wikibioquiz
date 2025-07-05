import { db } from './server/db';
import { famousPeople } from './shared/schema';
import { eq } from 'drizzle-orm';
import OpenAI from 'openai';
import { getAIHintGenerationPrompt, AI_HINT_SYSTEM_MESSAGE, AI_HINT_CONFIG } from './shared/prompt-templates';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🎯 USING CENTRALIZED TEMPLATE FROM shared/prompt-templates.ts
async function generateAIHints(name: string, nationality: string, timeperiod: string, occupation: string, biography: string): Promise<[string, string, string]> {
  try {
    console.log(`🤖 Generating AI hints for: ${name}`);
    
    // Use centralized template - any changes you make will automatically be reflected here
    const prompt = getAIHintGenerationPrompt({
      name,
      nationality,
      timeperiod,
      occupation,
      biography
    });

    const response = await openai.chat.completions.create({
      model: AI_HINT_CONFIG.model,
      messages: [
        {
          role: "system",
          content: AI_HINT_SYSTEM_MESSAGE
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: AI_HINT_CONFIG.response_format,
      max_tokens: AI_HINT_CONFIG.max_tokens,
      temperature: AI_HINT_CONFIG.temperature
    });

    const rawContent = response.choices[0].message.content || '{}';
    console.log(`🔍 RAW OPENAI RESPONSE: ${rawContent}`);
    
    const result = JSON.parse(rawContent);
    console.log(`🔍 PARSED JSON OBJECT:`, result);
    console.log(`🔍 ALL JSON KEYS:`, Object.keys(result));
    
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

async function testPersonHints(personName: string, testNumber: number) {
  console.log(`\n🧪 TEST ${testNumber}: ${personName.toUpperCase()}`);
  console.log('='.repeat(50 + personName.length));
  
  try {
    // Get person from database
    const person = await db.select().from(famousPeople).where(eq(famousPeople.name, personName)).limit(1);
    
    if (person.length === 0) {
      console.log(`❌ ${personName} not found in database`);
      return;
    }
    
    const personData = person[0];
    console.log('👤 PERSON DATA FROM DATABASE:');
    console.log(`   Name: ${personData.name}`);
    console.log(`   Nationality: ${personData.nationality}`);
    console.log(`   Time Period: ${personData.timeperiod}`);
    console.log(`   Occupation: ${personData.occupation}`);
    console.log(`   Wikipedia Title: ${personData.wikipediaTitle}`);
    console.log(`   Initials: ${personData.initials}`);
    console.log('');
    
    // Fetch Wikipedia data
    const wikipediaData = await fetchWikipediaData(personData.wikipediaTitle!);
    
    console.log('📚 WIKIPEDIA DATA:');
    console.log(`   Sections (${wikipediaData.sections.length}): ${wikipediaData.sections.join(', ')}`);
    console.log(`   Biography: ${wikipediaData.biography.substring(0, 150)}...`);
    console.log('');
    
    // Generate AI hints using the centralized template
    const [hint1, hint2, hint3] = await generateAIHints(
      personData.name,
      personData.nationality || 'Unknown',
      personData.timeperiod || 'Historical',
      personData.occupation || 'Historical Figure',
      wikipediaData.biography
    );
    
    console.log('💡 PRODUCTION TEMPLATE RESULTS:');
    console.log(`   Hint 1 (General): ${hint1}`);
    console.log(`   Hint 2 (Specific): ${hint2}`);
    console.log(`   Hint 3 (Very Specific): ${hint3}`);
    console.log('');
    
  } catch (error: any) {
    console.error(`❌ Test failed for ${personName}:`, error.message);
  }
}

async function test3RandomPeople() {
  console.log('\n🧪 TESTING 3 RANDOM PEOPLE WITH CENTRALIZED PRODUCTION TEMPLATE');
  console.log('================================================================\n');
  
  try {
    // Get 3 random people from database
    const randomPeople = await db.select({
      name: famousPeople.name,
      nationality: famousPeople.nationality,
      timeperiod: famousPeople.timeperiod,
      occupation: famousPeople.occupation,
      wikipediaTitle: famousPeople.wikipediaTitle,
      initials: famousPeople.initials
    }).from(famousPeople)
      .where(eq(famousPeople.filteredOut, 0))
      .orderBy(famousPeople.id) // Use consistent ordering, then limit
      .limit(2000); // Get a larger sample to pick from
    
    if (randomPeople.length < 3) {
      console.log('❌ Not enough people in database');
      return;
    }
    
    // Pick 3 random people from the sample
    const selectedPeople = [];
    const usedIndices = new Set();
    
    while (selectedPeople.length < 3) {
      const randomIndex = Math.floor(Math.random() * randomPeople.length);
      if (!usedIndices.has(randomIndex)) {
        usedIndices.add(randomIndex);
        selectedPeople.push(randomPeople[randomIndex]);
      }
    }
    
    console.log('🎯 SELECTED PEOPLE:');
    selectedPeople.forEach((person, i) => {
      console.log(`   ${i + 1}. ${person.name} (${person.nationality}, ${person.occupation})`);
    });
    console.log('');
    
    // Test each person
    for (let i = 0; i < selectedPeople.length; i++) {
      await testPersonHints(selectedPeople[i].name, i + 1);
    }
    
    console.log('🏁 ALL TESTS COMPLETE - USING CENTRALIZED TEMPLATE FROM shared/prompt-templates.ts');
    
  } catch (error: any) {
    console.error('❌ Test suite failed:', error.message);
  }
}

// Run the test
test3RandomPeople().catch(console.error);