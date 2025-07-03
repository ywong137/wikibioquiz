import { db } from '../server/db';
import { famousPeople } from '../shared/schema';

async function testWikipediaAPI() {
  console.log('🧪 TESTING WIKIPEDIA API RESPONSE CODES');
  console.log('📊 Checking rate limits and response codes');
  console.log(`⏰ Start: ${new Date().toLocaleTimeString()}\n`);
  
  // Get 10 random people from database for testing
  const testPeople = await db
    .select({ name: famousPeople.name })
    .from(famousPeople)
    .limit(10);
  
  console.log(`🎯 Testing with ${testPeople.length} people:\n`);
  
  let successCount = 0;
  let failureCount = 0;
  let rateLimitCount = 0;
  
  for (let i = 0; i < testPeople.length; i++) {
    const person = testPeople[i];
    const testNumber = i + 1;
    
    console.log(`📞 Request ${testNumber}/${testPeople.length}: ${person.name}`);
    
    try {
      const startTime = Date.now();
      const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(person.name)}&prop=sections&formatversion=2`;
      
      const response = await fetch(url);
      const responseTime = Date.now() - startTime;
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Response time: ${responseTime}ms`);
      
      if (response.status === 429) {
        console.log(`   ⚠️  RATE LIMITED - 429 response detected!`);
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          console.log(`   🕐 Retry-After header: ${retryAfter} seconds`);
        }
        rateLimitCount++;
      } else if (response.ok) {
        const data = await response.json();
        
        if (data.error) {
          console.log(`   ❌ Wikipedia API error: ${data.error.code} - ${data.error.info}`);
          failureCount++;
        } else {
          const sections = data.parse?.sections || [];
          console.log(`   ✅ Success - ${sections.length} sections found`);
          if (sections.length > 0) {
            console.log(`   📋 First few sections: ${sections.slice(0, 3).map((s: any) => s.line || s.anchor).join(', ')}`);
          }
          successCount++;
        }
      } else {
        console.log(`   ❌ HTTP Error: ${response.status} ${response.statusText}`);
        failureCount++;
      }
      
    } catch (error) {
      console.log(`   💥 Network error: ${error}`);
      failureCount++;
    }
    
    console.log(''); // Empty line for readability
    
    // Wait 8 seconds between requests to respect rate limits
    if (i < testPeople.length - 1) {
      console.log(`⏳ Waiting 8 seconds before next request...`);
      await new Promise(resolve => setTimeout(resolve, 8000));
    }
  }
  
  console.log('📊 FINAL RESULTS:');
  console.log(`✅ Successful requests: ${successCount}`);
  console.log(`❌ Failed requests: ${failureCount}`);
  console.log(`⚠️  Rate limited (429): ${rateLimitCount}`);
  console.log(`⏰ End: ${new Date().toLocaleTimeString()}`);
  
  if (rateLimitCount > 0) {
    console.log('\n🚨 RATE LIMITING DETECTED!');
    console.log('Consider getting a Wikipedia API token for higher limits.');
  } else if (successCount === testPeople.length) {
    console.log('\n🎉 ALL REQUESTS SUCCESSFUL!');
    console.log('Current rate (8s intervals) appears to be working.');
  }
}

testWikipediaAPI().catch(console.error);