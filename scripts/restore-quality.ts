import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNotNull } from 'drizzle-orm';
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
    const sectionsUrl = `https://en.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(wikipediaTitle)}&prop=sections&formatversion=2`;
    const sectionsResponse = await fetch(sectionsUrl);
    
    if (!sectionsResponse.ok) {
      throw new Error(`HTTP error! status: ${sectionsResponse.status}`);
    }
    
    const sectionsData = await sectionsResponse.json();
    
    if (sectionsData.error) {
      throw new Error(`Wikipedia API error: ${sectionsData.error.info}`);
    }
    
    const sections = sectionsData.parse?.sections || [];
    const sectionTitles = sections.map((section: WikipediaSection) => section.line || section.anchor || 'Unknown').filter(Boolean);
    
    return sectionTitles;
  } catch (error) {
    console.log(`Warning: Could not fetch Wikipedia data for ${wikipediaTitle}: ${error}`);
    return ['Biography', 'Early Life', 'Career', 'Legacy', 'Personal Life', 'Death'];
  }
}

async function generateHighQualityHints(name: string, nationality: string, timeperiod: string, occupation: string, sections: string[]): Promise<[string, string, string]> {
  try {
    const prompt = `Generate 3 progressive hints for a Wikipedia guessing game about ${name}. 
    
Context: ${nationality} ${occupation} from the ${timeperiod} period
Available sections: ${sections.join(', ')}

Generate 3 hints that progressively reveal more information:
1. First hint: Very general biographical context (birthplace, era, field of work)
2. Second hint: More specific achievements or notable works
3. Third hint: Very specific details that make them identifiable

Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}

Make the hints engaging, informative, and progressively more specific. Use the section information to create authentic biographical details.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert at creating engaging, educational biographical hints for a Wikipedia guessing game. Create hints that are accurate, progressive, and help players learn about historical figures."
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
    
    return [
      result.hint1 || `${nationality} ${occupation} from the ${timeperiod} period`,
      result.hint2 || `Notable ${occupation} known for significant achievements`,
      result.hint3 || `Famous ${nationality} ${occupation} from history`
    ];
  } catch (error) {
    console.log(`Warning: Could not generate AI hints for ${name}: ${error}`);
    return [
      `${nationality} ${occupation} from the ${timeperiod} period`,
      `Notable ${occupation} known for significant contributions`,
      `Famous ${nationality} ${occupation} from the ${timeperiod} era`
    ];
  }
}

function generateInitials(fullName: string): string {
  if (fullName.includes(' of ')) {
    const parts = fullName.split(' of ');
    const beforeOf = parts[0].trim().split(' ').map(word => word.charAt(0).toUpperCase()).join('. ');
    const afterOf = parts[1].trim().split(' ').map(word => word.charAt(0).toUpperCase()).join('. ');
    return `${beforeOf} of ${afterOf}`;
  }
  
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length === 1) {
    return nameParts[0].charAt(0).toUpperCase() + '.';
  }
  
  return nameParts.map(part => part.charAt(0).toUpperCase()).join('. ') + '.';
}

async function restoreQualityData() {
  console.log('🔧 QUALITY RESTORATION STARTED');
  console.log(`⏰ Start: ${new Date().toLocaleTimeString()}`);
  
  let totalProcessed = 0;
  let batchNumber = 0;
  const startTime = Date.now();
  
  while (true) {
    batchNumber++;
    
    // Process in smaller batches to avoid overwhelming OpenAI API
    const people = await db
      .select()
      .from(famousPeople)
      .where(isNotNull(famousPeople.processedAt))
      .limit(10); // Smaller batches for API calls
    
    if (people.length === 0) {
      console.log('🎉 ALL ENTRIES RESTORED!');
      break;
    }
    
    console.log(`🔧 BATCH ${batchNumber}: Restoring ${people.length} entries...`);
    
    for (const person of people) {
      try {
        // Fix hint format: "nationality - timeperiod - occupation"
        const properHint = `${person.nationality} - ${person.timeperiod} - ${person.occupation}`;
        
        // Generate proper initials
        const initials = generateInitials(person.name);
        
        // Fetch Wikipedia sections for authenticity
        const sections = await fetchWikipediaData(person.name);
        
        // Generate high-quality AI hints
        const [aiHint1, aiHint2, aiHint3] = await generateHighQualityHints(
          person.name,
          person.nationality || 'Unknown',
          person.timeperiod || 'Historical',
          person.occupation || 'Historical Figure',
          sections
        );
        
        // Update database with restored quality data
        await db
          .update(famousPeople)
          .set({
            sections: sections,
            hint: properHint,
            ai_hint_1: aiHint1,
            ai_hint_2: aiHint2,
            ai_hint_3: aiHint3,
            initials: initials,
            processedAt: new Date()
          })
          .where(eq(famousPeople.id, person.id));
        
        totalProcessed++;
        
        if (totalProcessed % 50 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`📊 Progress: ${totalProcessed} entries restored (${(totalProcessed / elapsed * 60).toFixed(1)} per minute)`);
        }
        
        // Rate limiting to avoid overwhelming OpenAI API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.log(`❌ Error restoring ${person.name}: ${error}`);
      }
    }
    
    // Small pause between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`🏆 QUALITY RESTORATION COMPLETE!`);
  console.log(`📈 Total restored: ${totalProcessed}`);
  console.log(`⏰ Total time: ${totalTime.toFixed(1)} seconds`);
  
  // Final verification
  const sampleCheck = await db
    .select({ name: famousPeople.name, hint: famousPeople.hint, ai_hint_1: famousPeople.ai_hint_1 })
    .from(famousPeople)
    .where(isNotNull(famousPeople.processedAt))
    .limit(3);
  
  console.log('\n📋 SAMPLE VERIFICATION:');
  sampleCheck.forEach(person => {
    console.log(`✅ ${person.name}`);
    console.log(`   Hint: ${person.hint}`);
    console.log(`   AI Hint: ${person.ai_hint_1}`);
  });
  
  console.log(`⏰ End: ${new Date().toLocaleTimeString()}`);
}

restoreQualityData().catch(console.error);