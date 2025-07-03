import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNull } from 'drizzle-orm';

function generateInitials(fullName: string): string {
  const name = fullName.trim();
  const parts = name.split(/\s+/);
  
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase() + '.';
  }
  
  const romanToArabic: { [key: string]: string } = {
    'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5',
    'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10',
    'XI': '11', 'XII': '12', 'XIII': '13', 'XIV': '14', 'XV': '15',
    'XVI': '16', 'XVII': '17', 'XVIII': '18', 'XIX': '19', 'XX': '20'
  };
  
  const preserveFullWords = ['of', 'the'];
  const lowercaseComponents = [
    'van', 'der', 'von', 'ibn', 'bin', 'al', 'el', 'la', 'le', 'de', 'da', 'di', 'du', 'des', 'del', 'della', 'dello'
  ];
  
  const result: string[] = [];
  
  for (const part of parts) {
    if (part.toLowerCase() === 'jr' || part.toLowerCase() === 'jr.') {
      result.push('Jr.');
    } else if (romanToArabic[part.toUpperCase()]) {
      result.push(romanToArabic[part.toUpperCase()]);
    } else if (preserveFullWords.includes(part.toLowerCase())) {
      result.push(part.toLowerCase());
    } else if (lowercaseComponents.includes(part.toLowerCase())) {
      result.push(part.charAt(0).toLowerCase() + '.');
    } else if (part.length > 0) {
      result.push(part.charAt(0).toUpperCase() + '.');
    }
  }
  
  return result.join(' ');
}

async function batchUpdateInitials() {
  console.log('Starting efficient batch initials update...');
  
  const BATCH_SIZE = 1000;
  let totalUpdated = 0;
  let batchNum = 0;
  
  while (true) {
    // Get next batch of people without initials
    const batch = await db
      .select({ id: famousPeople.id, name: famousPeople.name })
      .from(famousPeople)
      .where(isNull(famousPeople.initials))
      .limit(BATCH_SIZE);
    
    if (batch.length === 0) {
      console.log('✅ All initials updated!');
      break;
    }
    
    batchNum++;
    console.log(`Processing batch ${batchNum}: ${batch.length} people`);
    
    // Update each person in the batch
    for (const person of batch) {
      try {
        const newInitials = generateInitials(person.name);
        
        await db
          .update(famousPeople)
          .set({ initials: newInitials })
          .where(eq(famousPeople.id, person.id));
        
        totalUpdated++;
      } catch (error) {
        console.error(`Error updating ${person.name}:`, error);
      }
    }
    
    console.log(`✅ Batch ${batchNum} complete. Total updated: ${totalUpdated}`);
    
    // Small delay to prevent overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`🎉 FINAL RESULT: Updated ${totalUpdated} initials total`);
  
  // Show verification samples
  const samples = await db
    .select({ name: famousPeople.name, initials: famousPeople.initials })
    .from(famousPeople)
    .limit(10);
  
  console.log('\n📋 Sample results:');
  samples.forEach((sample, i) => {
    console.log(`${i + 1}. ${sample.name} → ${sample.initials}`);
  });
}

batchUpdateInitials().catch(console.error);