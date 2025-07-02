import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNull, sql, and } from 'drizzle-orm';

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

async function processAllEntries() {
  console.log('🌙 OVERNIGHT PROCESSOR STARTED');
  console.log(`⏰ Start time: ${new Date().toLocaleString()}`);
  
  let totalProcessed = 0;
  let sessionStart = Date.now();
  
  while (true) {
    // Get current stats
    const statsResult = await db.execute(`
      SELECT 
        COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed,
        COUNT(*) FILTER (WHERE processed_at IS NULL AND filtered_out = 0) as remaining
      FROM famous_people
    `);
    
    const stats = statsResult.rows[0];
    const remaining = parseInt(stats.remaining as string);
    
    console.log(`📊 Progress: ${stats.processed} processed, ${remaining} remaining`);
    
    if (remaining === 0) {
      console.log('🎉 ALL ENTRIES COMPLETED!');
      break;
    }
    
    // Get next batch
    const people = await db
      .select()
      .from(famousPeople)
      .where(and(
        eq(famousPeople.filteredOut, 0),
        isNull(famousPeople.processedAt)
      ))
      .limit(10); // Process 10 at a time
    
    if (people.length === 0) {
      console.log('No entries found to process');
      break;
    }
    
    console.log(`🔄 Processing batch of ${people.length} entries...`);
    
    for (const person of people) {
      try {
        const wikipediaTitle = person.name.replace(/ /g, '_');
        const sections = await fetchSections(wikipediaTitle);
        const hint = await generateHint(person.name, person.occupation || 'Historical Figure', person.timeperiod || 'Historical');
        const initials = generateInitials(person.name);
        
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
        
        if (totalProcessed % 50 === 0) {
          const elapsed = (Date.now() - sessionStart) / 1000 / 60;
          console.log(`✅ Milestone: ${totalProcessed} processed (${elapsed.toFixed(1)} minutes elapsed)`);
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 800));
        
      } catch (error) {
        console.log(`❌ Error processing ${person.name}, using fallback`);
        
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
        } catch (fallbackError) {
          console.log(`💥 Complete failure for ${person.name}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    // Brief pause between batches
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  const totalTime = (Date.now() - sessionStart) / 1000 / 60;
  console.log(`🏆 SESSION COMPLETE!`);
  console.log(`📈 Total processed: ${totalProcessed}`);
  console.log(`⏰ Total time: ${totalTime.toFixed(1)} minutes`);
  console.log(`🎯 Rate: ${(totalProcessed / totalTime).toFixed(1)} entries/minute`);
  
  // Final database count
  const finalResult = await db.execute(`
    SELECT COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as total
    FROM famous_people
  `);
  
  console.log(`📊 Final database count: ${finalResult.rows[0].total}`);
  console.log(`⏰ End time: ${new Date().toLocaleString()}`);
}

processAllEntries().catch(console.error);