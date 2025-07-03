import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNull } from 'drizzle-orm';

function generateInitials(fullName: string): string {
  const name = fullName.trim();
  const parts = name.split(/\s+/);
  
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + '.';
  
  const romanToArabic: { [key: string]: string } = {
    'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5', 'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10',
    'XI': '11', 'XII': '12', 'XIII': '13', 'XIV': '14', 'XV': '15', 'XVI': '16', 'XVII': '17', 'XVIII': '18', 'XIX': '19', 'XX': '20'
  };
  
  const preserveFullWords = ['of', 'the'];
  const lowercaseComponents = ['van', 'der', 'von', 'ibn', 'bin', 'al', 'el', 'la', 'le', 'de', 'da', 'di', 'du', 'des', 'del', 'della', 'dello'];
  
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

async function fastInitialsUpdate() {
  console.log('Starting fast initials update...');
  
  // Process 100 at a time for speed
  const BATCH_SIZE = 100;
  let totalUpdated = 0;
  
  while (totalUpdated < 10000) {
    const batch = await db
      .select({ id: famousPeople.id, name: famousPeople.name })
      .from(famousPeople)
      .where(isNull(famousPeople.initials))
      .limit(BATCH_SIZE);
    
    if (batch.length === 0) break;
    
    // Process batch quickly
    const updates = batch.map(person => ({
      id: person.id,
      initials: generateInitials(person.name)
    }));
    
    // Update in parallel
    await Promise.all(
      updates.map(update => 
        db.update(famousPeople)
          .set({ initials: update.initials })
          .where(eq(famousPeople.id, update.id))
      )
    );
    
    totalUpdated += batch.length;
    console.log(`Updated ${totalUpdated} initials...`);
    
    if (totalUpdated >= 1000) {
      console.log(`✅ Updated ${totalUpdated} initials successfully`);
      break;
    }
  }
  
  console.log(`🎉 COMPLETE: Updated ${totalUpdated} initials`);
}

fastInitialsUpdate().catch(console.error);