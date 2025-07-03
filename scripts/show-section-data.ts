import { db } from '../server/db';
import { famousPeople } from '../shared/schema';

async function showSectionData() {
  console.log('📋 WIKIPEDIA SECTION DATA TEST');
  console.log('🚀 10 rapid requests with full section data display');
  console.log(`⏰ Start: ${new Date().toLocaleTimeString()}\n`);
  
  // Get 10 people for testing
  const testPeople = await db
    .select({ name: famousPeople.name })
    .from(famousPeople)
    .limit(10);
  
  for (let i = 0; i < testPeople.length; i++) {
    const person = testPeople[i];
    
    console.log(`\n========== REQUEST ${i + 1}/10: ${person.name} ==========`);
    
    try {
      const startTime = Date.now();
      const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(person.name)}&prop=sections&formatversion=2`;
      
      const response = await fetch(url);
      const responseTime = Date.now() - startTime;
      
      console.log(`HTTP Status: ${response.status} ${response.statusText}`);
      console.log(`Response Time: ${responseTime}ms`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.error) {
          console.log(`Wikipedia Error: ${data.error.code} - ${data.error.info}`);
        } else if (data.parse && data.parse.sections) {
          const sections = data.parse.sections;
          console.log(`Sections Found: ${sections.length}`);
          
          if (sections.length > 0) {
            console.log('Section Data:');
            sections.forEach((section: any, index: number) => {
              const title = section.line || section.anchor || `Section ${section.number}`;
              console.log(`  ${index + 1}. ${title} (level ${section.level})`);
            });
          } else {
            console.log('No sections found in response');
          }
        } else {
          console.log('No parse data in response');
          console.log('Raw response keys:', Object.keys(data));
        }
      } else {
        console.log(`HTTP Error: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        console.log('Error body:', errorText.substring(0, 200));
      }
      
    } catch (error) {
      console.log(`Network Error: ${error}`);
    }
    
    // No delay - rapid fire requests
  }
  
  console.log(`\n⏰ End: ${new Date().toLocaleTimeString()}`);
}

showSectionData().catch(console.error);