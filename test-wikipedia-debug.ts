import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface WikipediaSection {
  toclevel: number;
  level: string;
  line: string;
  number: string;
  index: string;
  fromtitle: string;
  byteoffset: number;
  anchor: string;
}

function log(message: string) {
  console.log(message);
  fs.appendFileSync('output.txt', message + '\n');
}

async function fetchWikipediaData(wikipediaTitle: string) {
  log(`📖 WIKI: Fetching sections for ${wikipediaTitle}`);
  log(`📖 Fetching Wikipedia data for: ${wikipediaTitle}`);
  
  try {
    // Get sections
    const sectionsUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(wikipediaTitle)}&prop=sections&format=json&origin=*`;
    log(`🔗 SECTIONS URL: ${sectionsUrl}`);
    
    const sectionsResponse = await fetch(sectionsUrl);
    const sectionsData = await sectionsResponse.json();
    log(`📊 SECTIONS RESPONSE: ${JSON.stringify(sectionsData, null, 2)}`);
    
    if (sectionsData.error) {
      log(`❌ SECTIONS ERROR: ${JSON.stringify(sectionsData.error)}`);
      return { sections: [], biography: '' };
    }
    
    const sections = sectionsData.parse?.sections || [];
    log(`📋 RAW SECTIONS COUNT: ${sections.length}`);
    log(`📋 RAW SECTIONS DATA: ${JSON.stringify(sections, null, 2)}`);
    
    const sectionTitles = sections.map((section: WikipediaSection) => section.line || section.anchor || 'Unknown').filter(Boolean);
    log(`📝 SECTION TITLES: ${JSON.stringify(sectionTitles)}`);
    
    // Get biography
    const bioUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(wikipediaTitle)}&prop=extracts&exintro&explaintext&origin=*`;
    log(`🔗 BIOGRAPHY URL: ${bioUrl}`);
    
    const bioResponse = await fetch(bioUrl);
    const bioData = await bioResponse.json();
    log(`📊 BIOGRAPHY RESPONSE: ${JSON.stringify(bioData, null, 2)}`);
    
    const pages = bioData.query?.pages || {};
    const pageId = Object.keys(pages)[0];
    const biography = pages[pageId]?.extract || '';
    log(`📖 BIOGRAPHY TEXT LENGTH: ${biography.length}`);
    log(`📖 BIOGRAPHY TEXT: ${biography.substring(0, 500)}...`);
    
    log(`📖 Successfully fetched ${sectionTitles.length} sections and biography for ${wikipediaTitle}`);
    log(`📖 WIKI: Successfully fetched ${sectionTitles.length} sections`);
    
    return {
      sections: sectionTitles,
      biography
    };
    
  } catch (error) {
    log(`❌ WIKI ERROR: ${error}`);
    return { sections: [], biography: '' };
  }
}

async function generateAIHints(name: string, sections: string[]): Promise<[string, string, string]> {
  log(`🤖 AI: Generating hints for ${name}`);
  log(`🤖 Generating AI hints for: ${name}`);
  log(`🤖 Using sections: ${JSON.stringify(sections)}`);
  
  try {
    const prompt = `You are creating progressive hints for a guessing game about famous people. Based on these Wikipedia section headings for ${name}: ${sections.join(', ')}

Create exactly 3 progressive hints that get more specific:
1. Hint 1: Very general (profession, era, nationality)
2. Hint 2: More specific (major accomplishments or field)
3. Hint 3: Very specific (but don't give away the name)

Return as JSON with this exact format:
{
  "hint1": "your first hint",
  "hint2": "your second hint", 
  "hint3": "your third hint"
}`;

    log(`🤖 AI PROMPT: ${prompt}`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    log(`🤖 AI RAW RESPONSE: ${JSON.stringify(response, null, 2)}`);
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    log(`🤖 AI PARSED RESULT: ${JSON.stringify(result)}`);
    
    const hints: [string, string, string] = [
      result.hint1 || '',
      result.hint2 || '',
      result.hint3 || ''
    ];
    
    log(`🤖 Successfully generated 3 AI hints for ${name}`);
    log(`🤖 AI: Successfully generated 3 hints`);
    log(`🤖 FINAL HINTS: ${JSON.stringify(hints)}`);
    
    return hints;
    
  } catch (error) {
    log(`❌ AI ERROR: ${error}`);
    return ['', '', ''];
  }
}

async function testWikipediaLookup() {
  // Clear output file
  fs.writeFileSync('output.txt', '');
  
  log('🧪 STARTING WIKIPEDIA DEBUG TEST');
  log('=====================================');
  
  const testCases = [
    { id: 10095, name: 'Hans Lippershey', nationality: 'German', occupation: 'Inventor', timeperiod: 'Renaissance' },
    { id: 11717, name: 'Jotham of Judah', nationality: 'International', occupation: 'Politician', timeperiod: 'Ancient' }
  ];
  
  for (const person of testCases) {
    log(`\n🔍 TESTING PERSON: ${person.name} (ID: ${person.id})`);
    log(`📊 METADATA: ${person.nationality}, ${person.occupation}, ${person.timeperiod}`);
    log('-----------------------------------');
    
    // Convert name to Wikipedia title format
    const wikipediaTitle = person.name.replace(/ /g, '_');
    log(`🔗 WIKIPEDIA TITLE: ${wikipediaTitle}`);
    
    // Test Wikipedia fetch
    const { sections, biography } = await fetchWikipediaData(wikipediaTitle);
    
    log(`📊 FINAL SECTIONS COUNT: ${sections.length}`);
    log(`📊 FINAL SECTIONS: ${JSON.stringify(sections)}`);
    log(`📊 BIOGRAPHY LENGTH: ${biography.length}`);
    
    // Test AI hints if we have data
    if (sections.length > 0 || biography.length > 0) {
      const [hint1, hint2, hint3] = await generateAIHints(person.name, sections);
      log(`📊 AI HINT 1: ${hint1}`);
      log(`📊 AI HINT 2: ${hint2}`);
      log(`📊 AI HINT 3: ${hint3}`);
    } else {
      log(`⚠️ NO DATA FOR AI HINTS`);
    }
    
    log(`✅ COMPLETED TEST FOR: ${person.name}`);
    log('=====================================');
  }
  
  log('\n🎯 ALL TESTS COMPLETED');
  log('Check output.txt for full details');
}

// Run the test
testWikipediaLookup().catch(console.error);