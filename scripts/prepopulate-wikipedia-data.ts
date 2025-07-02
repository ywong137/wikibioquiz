import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNull, sql } from 'drizzle-orm';
import OpenAI from 'openai';

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

async function fetchWikipediaData(wikipediaTitle: string) {
  try {
    console.log(`📖 Fetching sections for: ${wikipediaTitle}`);
    
    const sectionsUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(wikipediaTitle)}&prop=sections&format=json&origin=*`;
    const sectionsResponse = await fetch(sectionsUrl);
    const sectionsData = await sectionsResponse.json();
    
    if (sectionsData.error) {
      console.log(`❌ Wikipedia error for ${wikipediaTitle}: ${sectionsData.error.info}`);
      return null;
    }
    
    const sections: WikipediaSection[] = sectionsData.parse?.sections || [];
    const sectionNames = sections.map(section => section.line);
    
    console.log(`📋 Found ${sectionNames.length} sections for ${wikipediaTitle}`);
    
    return sectionNames;
  } catch (error) {
    console.error(`❌ Error fetching Wikipedia data for ${wikipediaTitle}:`, error);
    return null;
  }
}

function generateInitials(fullName: string): string {
  const cleanName = fullName.replace(/_/g, ' ').trim();
  
  // Handle "X of Y" patterns specially
  if (cleanName.includes(' of ')) {
    const parts = cleanName.split(' of ');
    const beforeOf = parts[0].split(' ').map(word => word.charAt(0).toUpperCase()).join('. ');
    const afterOf = parts.slice(1).join(' of ').split(' ').map(word => word.charAt(0).toUpperCase()).join('. ');
    return `${beforeOf} of ${afterOf}`;
  }
  
  // Handle titles with numbers (e.g., "14th Dalai Lama")
  if (/^\d+th\s+/.test(cleanName)) {
    const match = cleanName.match(/^\d+th\s+(.+)/);
    if (match) {
      const titlePart = match[1];
      return titlePart.split(' ').map(word => word.charAt(0).toUpperCase()).join('. ');
    }
  }
  
  // Handle names with periods (e.g., "J.R.R. Tolkien")
  if (cleanName.includes('.')) {
    const parts = cleanName.split(' ');
    const initials = [];
    
    for (const part of parts) {
      if (part.includes('.')) {
        // Extract letters before periods: "J.R.R." → "J.R.R"
        const letters = part.match(/[A-Za-z]/g);
        if (letters) {
          initials.push(letters.join('.'));
        }
      } else if (part.length > 0 && /^[A-Za-z]/.test(part)) {
        initials.push(part.charAt(0).toUpperCase());
      }
    }
    
    return initials.join('. ') || cleanName.charAt(0).toUpperCase();
  }
  
  // Standard case: initials with periods
  const words = cleanName.split(' ').filter(word => word.length > 0);
  if (words.length > 0) {
    return words.map(word => word.charAt(0).toUpperCase()).join('. ');
  }
  
  return cleanName.charAt(0).toUpperCase();
}

function generateBasicHint(person: any): string {
  const parts = [];
  if (person.nationality) parts.push(person.nationality);
  if (person.timeperiod) parts.push(person.timeperiod);
  if (person.occupation) parts.push(person.occupation);
  
  return `"${parts.join(' • ')}"`;
}

async function generateAIHints(name: string, sections: string[]): Promise<[string, string, string]> {
  try {
    console.log(`🤖 Generating AI hints for: ${name}`);
    
    const sectionContext = sections.slice(0, 10).join(', '); // Use first 10 sections for context
    
    const prompt = `You are creating hints for a Wikipedia guessing game. Given the person "${name}" with these Wikipedia sections: ${sectionContext}

Generate exactly 3 progressive hints that help players guess this person:
1. HINT 1 (Hardest): A subtle clue about their most famous achievement or defining characteristic
2. HINT 2 (Medium): A more specific clue about what they're known for or their field
3. HINT 3 (Easiest): A direct clue that clearly identifies them but doesn't give away the name

Each hint should be 1-2 sentences, factual, and progressively more obvious. Format as JSON:
{"hint1": "...", "hint2": "...", "hint3": "..."}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 300,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return [
      result.hint1 || "Famous historical figure",
      result.hint2 || "Notable person from history", 
      result.hint3 || "Well-known individual"
    ];
    
  } catch (error) {
    console.error(`❌ Error generating AI hints for ${name}:`, error);
    return [
      "Famous historical figure",
      "Notable person from history",
      "Well-known individual"
    ];
  }
}

export async function prepopulateWikipediaData() {
  console.log('🚀 Starting Wikipedia data prepopulation...');
  
  // Get 100 random unprocessed people that aren't filtered out for testing
  const unprocessedPeople = await db
    .select()
    .from(famousPeople)
    .where(eq(famousPeople.filteredOut, 0))
    .where(isNull(famousPeople.processedAt))
    .orderBy(sql`RANDOM()`)
    .limit(100); // Test with 100 random entries
  
  console.log(`📊 Found ${unprocessedPeople.length} unprocessed people to prepopulate`);
  
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const person of unprocessedPeople) {
    try {
      console.log(`\n🔄 Processing ${processed + 1}/${unprocessedPeople.length}: ${person.name}`);
      
      const wikipediaTitle = person.wikipediaTitle || person.name.replace(/ /g, '_');
      
      // Fetch Wikipedia sections
      const sections = await fetchWikipediaData(wikipediaTitle);
      
      if (!sections) {
        skipped++;
        console.log(`⏭️ Skipped ${person.name} (insufficient sections or error)`);
        continue;
      }
      
      // Generate basic hint
      const basicHint = generateBasicHint(person);
      
      // Generate initials
      const initials = generateInitials(person.name);
      
      // Generate AI hints
      const [aiHint1, aiHint2, aiHint3] = await generateAIHints(person.name, sections);
      
      // Update database
      await db
        .update(famousPeople)
        .set({
          sections: sections,
          hint: basicHint,
          aiHint1: aiHint1,
          aiHint2: aiHint2, 
          aiHint3: aiHint3,
          initials: initials,
          processedAt: new Date(),
        })
        .where(eq(famousPeople.id, person.id));
      
      processed++;
      console.log(`✅ Successfully processed ${person.name} (${initials}) - ${sections.length} sections`);
      
      // Add delay to respect Wikipedia API limits
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      errors++;
      console.error(`❌ Error processing ${person.name}:`, error);
    }
  }
  
  console.log('\n📊 Prepopulation Complete:');
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ⏭️ Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📈 Total: ${processed + skipped + errors}/${unprocessedPeople.length}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  prepopulateWikipediaData().catch(console.error);
}