// Quick expansion to ~2000+ famous people using most productive categories
import { db } from "../server/db";
import { famousPeople, type InsertFamousPerson } from "../shared/schema";

// Most productive categories that yield the highest number of individual people
const QUICK_CATEGORIES = [
  "20th-century_American_people",
  "21st-century_American_people", 
  "19th-century_American_people",
  "20th-century_British_people",
  "19th-century_British_people",
  "American_film_actors",
  "American_television_actors", 
  "British_actors",
  "American_singers", 
  "American_musicians",
  "American_writers",
  "American_politicians",
  "American_scientists",
  "Academy_Award_for_Best_Actor_winners",
  "Academy_Award_for_Best_Actress_winners", 
  "Grammy_Award_winners",
  "Emmy_Award_winners",
  "Major_League_Baseball_players",
  "National_Basketball_Association_players",
  "Olympic_gold_medalists",
  "Nobel_Prize_in_Literature_laureates",
  "Nobel_Prize_in_Physics_laureates",
  "American_film_directors",
  "British_musicians",
  "French_actors",
  "German_actors"
];

async function quickExpandFamousPeople() {
  console.log("🚀 Quick expansion to ~2000+ famous people...");
  
  const allPeople = new Map<string, any>();
  
  for (const category of QUICK_CATEGORIES) {
    console.log(`🔍 ${category}`);
    
    try {
      const url = `https://en.wikipedia.org/w/api.php?` +
        `action=query&` +
        `list=categorymembers&` +
        `cmtitle=Category:${category}&` +
        `cmlimit=200&` +
        `format=json&` +
        `origin=*&` +
        `cmnamespace=0`;
      
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const data = await response.json();
      const members = data.query?.categorymembers || [];
      
      // Simple person filtering
      for (const member of members) {
        const title = member.title;
        const titleLower = title.toLowerCase();
        
        // Skip obvious non-person entries
        if (titleLower.includes("list of") || 
            titleLower.includes("category:") ||
            titleLower.includes("template:") ||
            titleLower.includes("disambiguation") ||
            titleLower.includes("album") ||
            titleLower.includes("film") ||
            titleLower.includes("movie") ||
            titleLower.includes("band") ||
            titleLower.includes("group") ||
            titleLower.includes("award") ||
            titleLower.includes("organization") ||
            titleLower.includes("company") ||
            titleLower.includes("university") ||
            titleLower.includes("school")) {
          continue;
        }
        
        if (!allPeople.has(title)) {
          // Categorize person
          let personCategory = "Historical Figure";
          let occupation = "Notable Person";
          let nationality = "International";
          let timeperiod = "Modern";
          
          // Extract metadata from source category
          if (category.includes("American")) nationality = "American";
          else if (category.includes("British")) nationality = "British";
          else if (category.includes("French")) nationality = "French";
          else if (category.includes("German")) nationality = "German";
          
          if (category.includes("21st-century")) timeperiod = "Contemporary";
          else if (category.includes("20th-century")) timeperiod = "Modern";
          else if (category.includes("19th-century")) timeperiod = "Modern";
          
          if (category.includes("actor")) {
            personCategory = "Actor";
            occupation = "Actor";
          } else if (category.includes("singer") || category.includes("musician")) {
            personCategory = "Musician";
            occupation = "Musician";
          } else if (category.includes("writer")) {
            personCategory = "Writer";
            occupation = "Writer";
          } else if (category.includes("politician")) {
            personCategory = "Political Leader";
            occupation = "Politician";
          } else if (category.includes("scientist") || category.includes("Nobel")) {
            personCategory = "Scientist";
            occupation = "Scientist";
          } else if (category.includes("director")) {
            personCategory = "Director";
            occupation = "Director";
          } else if (category.includes("Baseball") || category.includes("Basketball") || category.includes("Olympic")) {
            personCategory = "Athlete";
            occupation = "Athlete";
          }
          
          allPeople.set(title, {
            name: title,
            category: personCategory,
            timeperiod: timeperiod,
            nationality: nationality,
            occupation: occupation,
            birthYear: null,
            deathYear: null,
            wikipediaTitle: title.replace(/\s+/g, '_')
          });
        }
      }
      
      console.log(`📈 Total: ${allPeople.size} people`);
      
      // Quick rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.log(`❌ Error with ${category}`);
    }
  }
  
  console.log(`\n🎉 Collected ${allPeople.size} famous people!`);
  
  const peopleArray = Array.from(allPeople.values());
  
  // Clear existing and insert new
  console.log("🧹 Clearing existing data...");
  await db.delete(famousPeople);
  
  console.log("📦 Inserting new famous people...");
  const batchSize = 100;
  for (let i = 0; i < peopleArray.length; i += batchSize) {
    const batch = peopleArray.slice(i, i + batchSize);
    await db.insert(famousPeople).values(batch);
    console.log(`📦 Inserted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(peopleArray.length/batchSize)}`);
  }
  
  console.log(`\n✅ SUCCESS! Database now has ${peopleArray.length} famous people`);
  
  // Show sample breakdown
  const breakdown = new Map<string, number>();
  peopleArray.forEach(person => {
    const key = `${person.category} (${person.nationality})`;
    breakdown.set(key, (breakdown.get(key) || 0) + 1);
  });
  
  console.log("\n📊 Category breakdown:");
  Array.from(breakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([category, count]) => {
      console.log(`   ${category}: ${count}`);
    });
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  quickExpandFamousPeople()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}