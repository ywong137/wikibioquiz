import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNull, sql, and } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

async function fetchSections(wikipediaTitle: string): Promise<string[]> {
  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${wikipediaTitle}&format=json&prop=sections&formatversion=2`);
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    if (data.error || !data.parse || !data.parse.sections) {
      return [];
    }
    
    return data.parse.sections.map((section: any) => section.line || section.anchor || 'Unknown').filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function generateHint(name: string, occupation: string, timeperiod: string): Promise<string> {
  const hints = [
    `Famous ${occupation} from the ${timeperiod} period`,
    `Notable ${occupation} known for their historical contributions`,
    `${timeperiod} era ${occupation} of great significance`,
    `Renowned ${occupation} whose legacy endures today`
  ];
  
  return hints[Math.floor(Math.random() * hints.length)];
}

async function processEntries() {
  console.log('🚀 Simple processor starting...');
  
  let totalProcessed = 0;
  
  while (totalProcessed < 100) { // Process 100 entries to test
    // Get one unprocessed person
    const people = await db
      .select()
      .from(famousPeople)
      .where(and(
        eq(famousPeople.filteredOut, 0),
        isNull(famousPeople.processedAt)
      ))
      .limit(1);
    
    if (people.length === 0) {
      console.log('No more entries to process');
      break;
    }
    
    const person = people[0];
    
    try {
      console.log(`🔄 Processing: ${person.name}`);
      
      // Get Wikipedia sections
      const wikipediaTitle = person.name.replace(/ /g, '_');
      const sections = await fetchSections(wikipediaTitle);
      
      // Generate basic data
      const hint = await generateHint(person.name, person.occupation || 'Historical Figure', person.timeperiod || 'Historical');
      const initials = generateInitials(person.name);
      
      // Update database
      await db
        .update(famousPeople)
        .set({
          sections: sections.length > 0 ? sections : ['Biography', 'Life', 'Career', 'Legacy'],
          hint: hint,
          aiHint1: hint,
          aiHint2: `${person.occupation || 'Historical figure'} known for significant achievements`,
          aiHint3: `Notable ${person.occupation || 'person'} from ${person.nationality || 'history'}`,
          initials: initials,
          processedAt: new Date()
        })
        .where(eq(famousPeople.id, person.id));
      
      totalProcessed++;
      console.log(`✅ ${totalProcessed}/100: ${person.name} (${initials}) - ${sections.length} sections`);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`❌ Error processing ${person.name}:`, error);
      
      // Try with minimal data
      try {
        await db
          .update(famousPeople)
          .set({
            sections: ['Biography', 'Life', 'Career'],
            hint: `Historical ${person.occupation || 'figure'}`,
            aiHint1: `Historical ${person.occupation || 'figure'}`,
            aiHint2: `Historical ${person.occupation || 'figure'}`,
            aiHint3: `Historical ${person.occupation || 'figure'}`,
            initials: generateInitials(person.name),
            processedAt: new Date()
          })
          .where(eq(famousPeople.id, person.id));
        
        totalProcessed++;
        console.log(`⚠️ ${totalProcessed}/100: ${person.name} processed with fallback`);
      } catch (fallbackError) {
        console.log(`💥 Complete failure for ${person.name}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log(`🏁 Processed ${totalProcessed} entries`);
  
  // Get final stats
  const result = await db.execute(`
    SELECT COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as total
    FROM famous_people
  `);
  
  console.log(`📊 Total database entries: ${result.rows[0].total}`);
}

processEntries().catch(console.error);