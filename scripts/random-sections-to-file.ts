import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'fs';

async function randomSectionsToFile() {
  const output: string[] = [];
  
  output.push('WIKIPEDIA SECTION DATA TEST');
  output.push('10 RANDOM PEOPLE FROM DATABASE');
  output.push(`START TIME: ${new Date().toLocaleTimeString()}`);
  output.push('');
  
  // Get 10 truly random people using SQL ORDER BY RANDOM()
  const randomPeople = await db
    .select({ name: famousPeople.name })
    .from(famousPeople)
    .orderBy(sql`RANDOM()`)
    .limit(10);
  
  for (let i = 0; i < randomPeople.length; i++) {
    const person = randomPeople[i];
    
    output.push(`========== REQUEST ${i + 1}/10: ${person.name} ==========`);
    
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(person.name)}&prop=sections&formatversion=2`;
      const response = await fetch(url);
      
      output.push(`HTTP Status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.error) {
          output.push(`Wikipedia Error: ${data.error.code} - ${data.error.info}`);
        } else if (data.parse && data.parse.sections) {
          const sections = data.parse.sections;
          output.push(`Sections Found: ${sections.length}`);
          output.push('Section Data:');
          
          sections.forEach((section: any, index: number) => {
            const title = section.line || section.anchor || `Section ${section.number}`;
            output.push(`  ${index + 1}. ${title} (level ${section.level})`);
          });
        } else {
          output.push('No parse data in response');
        }
      } else {
        output.push(`HTTP Error: ${response.status} ${response.statusText}`);
      }
      
    } catch (error) {
      output.push(`Network Error: ${error}`);
    }
    
    output.push('');
  }
  
  output.push(`END TIME: ${new Date().toLocaleTimeString()}`);
  
  // Write to file
  writeFileSync('output.txt', output.join('\n'));
  
  console.log('✅ COMPLETE - Full data written to output.txt');
  console.log(`📊 Processed ${randomPeople.length} random people`);
  console.log('📄 Check output.txt for all section data');
}

randomSectionsToFile().catch(console.error);