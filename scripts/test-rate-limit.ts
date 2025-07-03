import { db } from '../server/db';
import { famousPeople } from '../shared/schema';

async function testRateLimit() {
  console.log('🚨 TESTING WIKIPEDIA RATE LIMITS');
  console.log('⚡ Making rapid requests to trigger 429 responses');
  console.log(`⏰ Start: ${new Date().toLocaleTimeString()}\n`);
  
  // Get 5 people for rapid testing
  const testPeople = await db
    .select({ name: famousPeople.name })
    .from(famousPeople)
    .limit(5);
  
  let successCount = 0;
  let rateLimitCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < testPeople.length; i++) {
    const person = testPeople[i];
    
    console.log(`📞 Rapid Request ${i + 1}: ${person.name}`);
    
    try {
      const startTime = Date.now();
      const url = `https://en.wikipedia.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(person.name)}&prop=sections&formatversion=2`;
      
      const response = await fetch(url);
      const responseTime = Date.now() - startTime;
      
      console.log(`   Status: ${response.status} ${response.statusText} (${responseTime}ms)`);
      
      if (response.status === 429) {
        console.log(`   🚨 RATE LIMITED! 429 response detected`);
        const retryAfter = response.headers.get('Retry-After');
        const rateLimitType = response.headers.get('X-RateLimit-Type') || 'unknown';
        const rateLimitLimit = response.headers.get('X-RateLimit-Limit') || 'unknown';
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining') || 'unknown';
        
        console.log(`   🕐 Retry-After: ${retryAfter || 'not specified'}`);
        console.log(`   📊 Rate limit info: Type=${rateLimitType}, Limit=${rateLimitLimit}, Remaining=${rateLimitRemaining}`);
        rateLimitCount++;
      } else if (response.ok) {
        const data = await response.json();
        if (data.error) {
          console.log(`   ❌ API Error: ${data.error.code} - ${data.error.info}`);
          errorCount++;
        } else {
          const sections = data.parse?.sections || [];
          console.log(`   ✅ Success: ${sections.length} sections`);
          successCount++;
        }
      } else {
        console.log(`   ❌ HTTP Error: ${response.status}`);
        errorCount++;
      }
      
    } catch (error) {
      console.log(`   💥 Network Error: ${error}`);
      errorCount++;
    }
    
    // Very short delay - should trigger rate limits if they exist
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 RAPID TEST RESULTS:');
  console.log(`✅ Success: ${successCount}`);
  console.log(`🚨 Rate Limited (429): ${rateLimitCount}`);
  console.log(`❌ Other Errors: ${errorCount}`);
  
  if (rateLimitCount > 0) {
    console.log('\n🎯 RATE LIMIT CONFIRMED!');
    console.log('Wikipedia is returning 429 responses as documented.');
  } else {
    console.log('\n🤔 NO RATE LIMITS DETECTED');
    console.log('Either rate limits are higher than expected, or our IP has special treatment.');
  }
  
  console.log(`⏰ End: ${new Date().toLocaleTimeString()}`);
}

testRateLimit().catch(console.error);