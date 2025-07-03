import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq } from 'drizzle-orm';

function generateInitials(fullName: string): string {
  const name = fullName.trim();
  
  // Split by spaces to get parts
  const parts = name.split(/\s+/);
  
  if (parts.length === 0) return '';
  
  // Handle single names (like "Muhammad", "Plato")
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase() + '.';
  }
  
  // Convert Roman numerals to Arabic numerals
  const romanToArabic: { [key: string]: string } = {
    'I': '1', 'II': '2', 'III': '3', 'IV': '4', 'V': '5',
    'VI': '6', 'VII': '7', 'VIII': '8', 'IX': '9', 'X': '10',
    'XI': '11', 'XII': '12', 'XIII': '13', 'XIV': '14', 'XV': '15',
    'XVI': '16', 'XVII': '17', 'XVIII': '18', 'XIX': '19', 'XX': '20'
  };
  
  // Components that should be preserved as full words
  const preserveFullWords = ['of', 'the'];
  
  // Lowercase components that should remain lowercase in initials
  const lowercaseComponents = [
    'van', 'der', 'von', 'ibn', 'bin', 'al', 'el', 'la', 'le', 'de', 'da', 'di', 'du', 'des', 'del', 'della', 'dello'
  ];
  
  const result: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // Handle "Jr" - preserve as "Jr."
    if (part.toLowerCase() === 'jr' || part.toLowerCase() === 'jr.') {
      result.push('Jr.');
      continue;
    }
    
    // Handle Roman numerals - convert to Arabic
    if (romanToArabic[part.toUpperCase()]) {
      result.push(romanToArabic[part.toUpperCase()]);
      continue;
    }
    
    // Handle words to preserve as full words
    if (preserveFullWords.includes(part.toLowerCase())) {
      result.push(part.toLowerCase());
      continue;
    }
    
    // Handle lowercase components - keep lowercase initial
    if (lowercaseComponents.includes(part.toLowerCase())) {
      result.push(part.charAt(0).toLowerCase() + '.');
      continue;
    }
    
    // Handle regular words - take first letter and add period (uppercase)
    if (part.length > 0) {
      result.push(part.charAt(0).toUpperCase() + '.');
    }
  }
  
  return result.join(' ');
}

async function updateAllInitials() {
  console.log('Starting initials update for all famous people...');
  
  // Get all people from the database
  const allPeople = await db
    .select({ id: famousPeople.id, name: famousPeople.name })
    .from(famousPeople);
  
  console.log(`Found ${allPeople.length} people to update`);
  
  let updated = 0;
  let errors = 0;
  
  for (let i = 0; i < allPeople.length; i++) {
    const person = allPeople[i];
    
    try {
      const newInitials = generateInitials(person.name);
      
      // Update the person's initials
      await db
        .update(famousPeople)
        .set({ initials: newInitials })
        .where(eq(famousPeople.id, person.id));
      
      updated++;
      
      if (updated % 100 === 0) {
        console.log(`Updated ${updated}/${allPeople.length} initials...`);
      }
      
    } catch (error) {
      console.error(`Error updating initials for ${person.name}:`, error);
      errors++;
    }
  }
  
  console.log(`✅ COMPLETE - Updated ${updated} initials successfully`);
  if (errors > 0) {
    console.log(`❌ ERRORS - ${errors} entries failed to update`);
  }
  
  // Show some examples
  console.log('\n📋 VERIFICATION - Sample updated initials:');
  const samples = await db
    .select({ name: famousPeople.name, initials: famousPeople.initials })
    .from(famousPeople)
    .limit(10);
  
  samples.forEach((sample, index) => {
    console.log(`${index + 1}. ${sample.name} → ${sample.initials}`);
  });
}

updateAllInitials().catch(console.error);