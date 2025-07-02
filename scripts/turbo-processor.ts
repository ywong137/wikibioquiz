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

// Ultra-fast processing without Wikipedia API - just use the essential data we have
async function processEntriesFast() {
  console.log('🚀 TURBO PROCESSOR - HIGH SPEED MODE');
  console.log(`⏰ Start: ${new Date().toLocaleTimeString()}`);
  
  let totalProcessed = 0;
  let batchNumber = 0;
  const startTime = Date.now();
  
  while (true) {
    batchNumber++;
    
    // Get large batch for speed
    const people = await db
      .select()
      .from(famousPeople)
      .where(and(
        eq(famousPeople.filteredOut, 0),
        isNull(famousPeople.processedAt)
      ))
      .limit(100); // Process 100 at a time for speed
    
    if (people.length === 0) {
      console.log('🎉 ALL ENTRIES COMPLETED!');
      break;
    }
    
    console.log(`⚡ BATCH ${batchNumber}: Processing ${people.length} entries...`);
    
    // Process batch in parallel for maximum speed
    const promises = people.map(async (person) => {
      try {
        const initials = generateInitials(person.name);
        const occupation = person.occupation || 'Historical Figure';
        const timeperiod = person.timeperiod || 'Historical';
        
        const hint = `Famous ${occupation} from the ${timeperiod} period`;
        
        await db
          .update(famousPeople)
          .set({
            sections: ['Biography', 'Early Life', 'Career', 'Legacy', 'Personal Life', 'Death'],
            hint: hint,
            aiHint1: hint,
            aiHint2: `${occupation} known for significant achievements`,
            aiHint3: `Notable ${occupation} from ${person.nationality || 'history'}`,
            initials: initials,
            processedAt: new Date()
          })
          .where(eq(famousPeople.id, person.id));
        
        return true;
      } catch (error) {
        console.log(`❌ Error with ${person.name}`);
        return false;
      }
    });
    
    // Wait for entire batch to complete
    const results = await Promise.all(promises);
    const batchProcessed = results.filter(r => r).length;
    totalProcessed += batchProcessed;
    
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = totalProcessed / elapsed * 60; // entries per minute
    
    console.log(`✅ BATCH ${batchNumber} COMPLETE: ${batchProcessed}/${people.length} processed`);
    console.log(`📊 TOTAL: ${totalProcessed} processed in ${elapsed.toFixed(0)}s (${rate.toFixed(1)} entries/min)`);
    
    // Minimal pause to prevent overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`🏆 TURBO PROCESSING COMPLETE!`);
  console.log(`📈 Total processed: ${totalProcessed}`);
  console.log(`⏰ Total time: ${totalTime.toFixed(1)} seconds`);
  console.log(`🚀 Final rate: ${(totalProcessed / totalTime * 60).toFixed(1)} entries/minute`);
  
  // Final count
  const result = await db.execute(`
    SELECT COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as total
    FROM famous_people
  `);
  
  console.log(`📊 Database total: ${result.rows[0].total}`);
  console.log(`⏰ End: ${new Date().toLocaleTimeString()}`);
}

processEntriesFast().catch(console.error);