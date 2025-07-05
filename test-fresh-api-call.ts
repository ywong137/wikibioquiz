import OpenAI from 'openai';
import { getAIHintGenerationPrompt, AI_HINT_CONFIG, AI_HINT_SYSTEM_MESSAGE } from './shared/prompt-templates.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchWikipediaData(wikipediaTitle: string): Promise<{ sections: string[], biography: string }> {
  try {
    console.log(`📖 Fetching Wikipedia data for: ${wikipediaTitle}`);
    
    // Get page summary for biography
    const summaryResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikipediaTitle)}`);
    if (!summaryResponse.ok) {
      throw new Error(`Summary API returned ${summaryResponse.status}`);
    }
    
    const summaryData = await summaryResponse.json();
    const biography = summaryData.extract || '';
    
    // Get sections using the parse API
    const sectionsResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(wikipediaTitle)}&format=json&prop=sections&formatversion=2&origin=*`);
    if (!sectionsResponse.ok) {
      throw new Error(`Parse API returned ${sectionsResponse.status}`);
    }
    
    const sectionsData = await sectionsResponse.json();
    
    if (sectionsData.error) {
      throw new Error(`Wikipedia API error: ${sectionsData.error.info}`);
    }
    
    const sections = sectionsData.parse?.sections || [];
    const sectionTitles = sections
      .map((section: any) => section.line || section.anchor || 'Unknown')
      .filter(Boolean)
      .filter((title: string) => 
        !title.toLowerCase().includes('reference') && 
        !title.toLowerCase().includes('external') &&
        !title.toLowerCase().includes('see also') &&
        !title.toLowerCase().includes('notes')
      );
    
    console.log(`📖 Successfully fetched ${sectionTitles.length} sections and biography for ${wikipediaTitle}`);
    
    return {
      sections: sectionTitles,
      biography: biography
    };
    
  } catch (error) {
    console.error(`❌ Failed to fetch Wikipedia data for ${wikipediaTitle}:`, error);
    throw new Error(`Wikipedia fetch failed: ${error}`);
  }
}

async function generateAIHints(name: string, nationality: string, timeperiod: string, occupation: string, biography: string): Promise<[string, string, string]> {
  try {
    console.log(`🤖 Generating AI hints for: ${name}`);
    
    // 🎯 USING CENTRALIZED TEMPLATE FROM shared/prompt-templates.ts
    const prompt = getAIHintGenerationPrompt({
      name,
      nationality,
      timeperiod,
      occupation,
      biography
    });

    console.log(`🔍 PROMPT BEING SENT TO OPENAI:\n${prompt}`);

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
    
    if (!result.hint1 || !result.hint2 || !result.hint3) {
      throw new Error('Invalid hint response from OpenAI');
    }

    console.log(`🤖 Successfully generated 3 AI hints for ${name}`);
    
    return [result.hint1, result.hint2, result.hint3];
    
  } catch (error) {
    console.error(`❌ AI hint generation failed for ${name}:`, error);
    throw new Error(`AI hint generation failed: ${error}`);
  }
}

async function testFreshAPICall() {
  console.log('🧪 TESTING FRESH API CALLS FOR HANS VON BÜLOW');
  console.log('================================================================');

  const testPerson = {
    name: 'Hans von Bülow',
    nationality: 'German',
    timeperiod: 'Modern',
    occupation: 'Musician',
    wikipediaTitle: 'Hans_von_Bülow'
  };

  try {
    // 1. Fetch Wikipedia data
    console.log('\n📖 FETCHING WIKIPEDIA DATA...');
    const { sections, biography } = await fetchWikipediaData(testPerson.wikipediaTitle);
    
    console.log('📚 WIKIPEDIA RESULTS:');
    console.log(`   Sections Count: ${sections.length}`);
    console.log(`   Sections: ${sections.slice(0, 5).join(', ')}${sections.length > 5 ? '...' : ''}`);
    console.log(`   Biography Length: ${biography.length} characters`);
    console.log(`   Biography Preview: ${biography.substring(0, 200)}...`);

    // 2. Generate AI hints using current template
    console.log('\n🤖 GENERATING AI HINTS WITH CURRENT TEMPLATE...');
    const [hint1, hint2, hint3] = await generateAIHints(
      testPerson.name,
      testPerson.nationality,
      testPerson.timeperiod,
      testPerson.occupation,
      biography
    );

    console.log('\n💡 FRESH AI HINTS GENERATED:');
    console.log(JSON.stringify({
      hint1,
      hint2,
      hint3,
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log('\n✅ TEST COMPLETED SUCCESSFULLY');
    
  } catch (error) {
    console.error('❌ TEST FAILED:', error);
  }
}

testFreshAPICall();