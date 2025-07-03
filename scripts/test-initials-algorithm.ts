import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';

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
  
  // Lowercase components that should remain lowercase in initials
  const lowercaseComponents = [
    'of', 'the', 'van', 'der', 'von', 'ibn', 'bin', 'al', 'el', 'la', 'le', 'de', 'da', 'di', 'du', 'des', 'del', 'della', 'dello'
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

async function testInitialsAlgorithm() {
  console.log('Testing initials algorithm on 200 random names...');
  
  const output: string[] = [];
  output.push('INITIALS ALGORITHM TEST');
  output.push('200 RANDOM NAMES FROM DATABASE');
  output.push(`TEST TIME: ${new Date().toLocaleString()}`);
  output.push('');
  output.push('ALGORITHM RULES:');
  output.push('- Two words: first initial, last initial (John Smith → J. S.)');
  output.push('- Three words: first, middle, last (John Michael Smith → J. M. S.)');
  output.push('- Lowercase components preserved: Musa ibn Nusayr → M. i. N.');
  output.push('- Multiple lowercase: Rogier van der Weyden → R. v. d. W.');
  output.push('- Roman numerals converted: Louis XVII → L. 17, Henry VIII → H. 8');
  output.push('- "Jr" preserved: Martin Luther King Jr → M. L. K. Jr.');
  output.push('');
  output.push('FORMAT: Original Name → Calculated Initials');
  output.push('================================================================================');
  output.push('');
  
  const randomNames = await db
    .select({ name: famousPeople.name })
    .from(famousPeople)
    .orderBy(sql`RANDOM()`)
    .limit(200);
  
  for (let i = 0; i < randomNames.length; i++) {
    const name = randomNames[i].name;
    const initials = generateInitials(name);
    
    output.push(`${String(i + 1).padStart(3, ' ')}. ${name} → ${initials}`);
    
    if (i % 50 === 49) {
      console.log(`Processed ${i + 1}/200 names...`);
    }
  }
  
  output.push('');
  output.push('================================================================================');
  output.push(`COMPLETED: ${new Date().toLocaleString()}`);
  output.push(`TOTAL NAMES PROCESSED: ${randomNames.length}`);
  
  writeFileSync('output4.txt', output.join('\n'));
  console.log('✅ COMPLETE - Initials algorithm test results written to output4.txt');
}

testInitialsAlgorithm().catch(console.error);