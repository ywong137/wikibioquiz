import { db } from '../server/db';
import { famousPeople } from '../shared/schema';

async function quickSections() {
  // Get 10 people
  const people = await db.select({ name: famousPeople.name }).from(famousPeople).limit(10);
  
  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    
    console.log(`\n=== ${i + 1}/10: ${person.name} ===`);
    
    const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(person.name)}&prop=sections&formatversion=2`;
    const response = await fetch(url);
    
    console.log(`Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      const sections = data.parse?.sections || [];
      console.log(`Sections: ${sections.length}`);
      sections.forEach((s: any, idx: number) => {
        console.log(`${idx + 1}. ${s.line || s.anchor}`);
      });
    } else {
      console.log('Failed');
    }
  }
}

quickSections();