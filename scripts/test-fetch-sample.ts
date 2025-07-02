// Test script to verify the Wikipedia mining approach with a small sample
import { db } from "../server/db";
import { famousPeople, type InsertFamousPerson } from "../shared/schema";

async function testFetchSample() {
  console.log("🧪 Testing Wikipedia category mining with small sample...");
  
  // Test with just a few high-quality categories
  const testCategories = [
    "Academy_Award_winners",
    "Nobel_Prize_laureates", 
    "Presidents_of_the_United_States",
    "Rock_and_Roll_Hall_of_Fame_inductees"
  ];
  
  const allPeople = new Map<string, any>();
  
  for (const category of testCategories) {
    console.log(`🔍 Testing category: ${category}`);
    
    try {
      const url = `https://en.wikipedia.org/w/api.php?` +
        `action=query&` +
        `list=categorymembers&` +
        `cmtitle=Category:${category}&` +
        `cmlimit=50&` +
        `format=json&` +
        `origin=*&` +
        `cmnamespace=0`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`⚠️ Failed to fetch category ${category}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      const members = data.query?.categorymembers || [];
      
      console.log(`📄 Found ${members.length} pages in ${category}`);
      console.log(`📋 Sample titles: ${members.slice(0, 5).map((m: any) => m.title).join(', ')}`);
      
      for (const member of members) {
        if (!allPeople.has(member.title)) {
          allPeople.set(member.title, {
            title: member.title,
            pageid: member.pageid,
            category: category
          });
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(`❌ Error with category ${category}: ${error}`);
    }
  }
  
  console.log(`\n📊 Total unique people found: ${allPeople.size}`);
  
  // Show sample of what we found
  const samplePeople = Array.from(allPeople.values()).slice(0, 20);
  console.log("\n🎯 Sample of people found:");
  samplePeople.forEach((person, i) => {
    console.log(`${i + 1}. ${person.title} (from ${person.category})`);
  });
  
  // Test pageview fetching for a few people
  console.log("\n📊 Testing pageview fetching...");
  const testTitles = samplePeople.slice(0, 5).map(p => p.title);
  
  for (const title of testTitles) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      const formatDate = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');
      
      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title)}/daily/${formatDate(startDate)}/${formatDate(endDate)}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const totalViews = data.items?.reduce((sum: number, item: any) => sum + item.views, 0) || 0;
        console.log(`📈 ${title}: ${totalViews.toLocaleString()} views (30 days)`);
      } else {
        console.log(`📈 ${title}: No pageview data available`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.log(`📈 ${title}: Error fetching pageviews`);
    }
  }
  
  console.log("\n✅ Test completed successfully!");
  console.log("🚀 The full script should work well for gathering thousands of famous people");
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testFetchSample()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}