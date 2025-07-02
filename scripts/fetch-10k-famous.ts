// Optimized script to fetch ~10,000 famous people using proven high-yield Wikipedia categories
import { db } from "../server/db";
import { famousPeople, type InsertFamousPerson } from "../shared/schema";

// High-yield categories that contain mostly individual people (not lists/concepts)
const HIGH_YIELD_CATEGORIES = [
  // Time periods - individual people by century
  "20th-century_American_people",
  "21st-century_American_people", 
  "20th-century_British_people",
  "20th-century_French_people",
  "20th-century_German_people",
  "20th-century_Italian_people",
  "20th-century_Russian_people",
  "20th-century_Canadian_people",
  "20th-century_Australian_people",
  "19th-century_American_people",
  "19th-century_British_people",
  "19th-century_French_people",
  "19th-century_German_people",
  
  // Professions - specific roles
  "American_film_actors",
  "American_television_actors", 
  "British_actors",
  "American_singers", 
  "American_musicians",
  "British_musicians",
  "American_writers",
  "British_writers",
  "American_politicians",
  "British_politicians",
  "American_scientists",
  "American_artists",
  "American_athletes",
  "Olympic_athletes",
  
  // Specific high-quality subcategories
  "American_film_directors",
  "American_screenwriters",
  "American_composers",
  "American_painters",
  "American_photographers",
  "American_journalists",
  "American_businesspeople",
  "American_engineers",
  "American_inventors",
  "American_military_personnel",
  
  // British equivalents
  "British_film_directors",
  "British_writers", 
  "British_scientists",
  "British_artists",
  "British_politicians",
  
  // International
  "French_actors",
  "German_actors",
  "Italian_actors",
  "Canadian_actors",
  "Australian_actors",
  "French_writers",
  "German_writers",
  "Italian_writers",
  "Canadian_writers",
  "Australian_writers",
  
  // Award winners (high-quality people)
  "Academy_Award_for_Best_Actor_winners",
  "Academy_Award_for_Best_Actress_winners", 
  "Academy_Award_for_Best_Supporting_Actor_winners",
  "Academy_Award_for_Best_Supporting_Actress_winners",
  "Academy_Award_for_Best_Director_winners",
  "Golden_Globe_winners",
  "Emmy_Award_winners",
  "Grammy_Award_winners",
  "Tony_Award_winners",
  "Pulitzer_Prize_winners",
  "Nobel_Peace_Prize_laureates",
  "Nobel_Prize_in_Literature_laureates",
  "Nobel_Prize_in_Physics_laureates",
  "Nobel_Prize_in_Chemistry_laureates",
  "Nobel_Prize_in_Physiology_or_Medicine_laureates",
  
  // Sports - major leagues and Olympics
  "Major_League_Baseball_players",
  "National_Basketball_Association_players",
  "National_Football_League_players",
  "Association_football_players",
  "Tennis_players",
  "Golfers",
  "Olympic_gold_medalists",
  
  // Historical figures by region
  "American_military_leaders",
  "British_military_leaders", 
  "American_inventors",
  "British_inventors",
  "American_explorers",
  "British_explorers",
  
  // Royalty and nobility
  "British_monarchs",
  "European_monarchs",
  "Members_of_the_British_royal_family",
  
  // Religious and philosophical figures
  "Christian_saints",
  "American_philosophers",
  "British_philosophers",
  "German_philosophers",
  "French_philosophers"
];

interface PersonCandidate {
  title: string;
  pageid: number;
  category: string;
  views?: number;
}

async function fetchCategoryMembers(category: string, limit: number = 500): Promise<PersonCandidate[]> {
  console.log(`🔍 Fetching from: ${category}`);
  
  try {
    const url = `https://en.wikipedia.org/w/api.php?` +
      `action=query&` +
      `list=categorymembers&` +
      `cmtitle=Category:${category}&` +
      `cmlimit=${limit}&` +
      `format=json&` +
      `origin=*&` +
      `cmnamespace=0`;
    
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    const members = data.query?.categorymembers || [];
    
    console.log(`📄 Found ${members.length} entries in ${category}`);
    
    return members.map((member: any) => ({
      title: member.title,
      pageid: member.pageid,
      category: category
    }));
    
  } catch (error) {
    console.log(`❌ Error with ${category}: ${error}`);
    return [];
  }
}

function isPersonTitle(title: string): boolean {
  const titleLower = title.toLowerCase();
  
  // Exclude obvious non-person patterns
  const excludePatterns = [
    "list of", "category:", "template:", "disambiguation",
    "album", "film", "movie", "book", "song", "band",
    "company", "organization", "university", "school",
    "award", "prize", "competition", "championship",
    "building", "stadium", "theatre", "museum",
    "city", "town", "county", "state", "country",
    "river", "mountain", "lake", "island", "park",
    "road", "street", "avenue", "bridge", "tunnel"
  ];
  
  return !excludePatterns.some(pattern => titleLower.includes(pattern));
}

function categorizeAndDetermineMeta(title: string, sourceCategory: string): {
  category: string;
  timeperiod: string;
  occupation: string;
  nationality: string;
} {
  const titleLower = title.toLowerCase();
  const sourceLower = sourceCategory.toLowerCase();
  
  // Determine nationality from source category
  let nationality = "International";
  if (sourceLower.includes("american")) nationality = "American";
  else if (sourceLower.includes("british")) nationality = "British";
  else if (sourceLower.includes("french")) nationality = "French";
  else if (sourceLower.includes("german")) nationality = "German";
  else if (sourceLower.includes("italian")) nationality = "Italian";
  else if (sourceLower.includes("canadian")) nationality = "Canadian";
  else if (sourceLower.includes("australian")) nationality = "Australian";
  else if (sourceLower.includes("russian")) nationality = "Russian";
  
  // Determine timeperiod from source category
  let timeperiod = "Modern";
  if (sourceLower.includes("21st-century")) timeperiod = "Contemporary";
  else if (sourceLower.includes("20th-century")) timeperiod = "Modern";
  else if (sourceLower.includes("19th-century")) timeperiod = "Modern";
  else if (sourceLower.includes("18th-century")) timeperiod = "Early Modern";
  else if (sourceLower.includes("ancient")) timeperiod = "Ancient";
  else if (sourceLower.includes("medieval")) timeperiod = "Medieval";
  else if (sourceLower.includes("renaissance")) timeperiod = "Renaissance";
  
  // Determine category and occupation from source category
  let category = "Historical Figure";
  let occupation = "Notable Person";
  
  if (sourceLower.includes("actor") || sourceLower.includes("actress")) {
    category = "Actor";
    occupation = "Actor";
  } else if (sourceLower.includes("singer") || sourceLower.includes("musician") || sourceLower.includes("composer")) {
    category = "Musician";
    occupation = "Musician";
  } else if (sourceLower.includes("writer") || sourceLower.includes("author") || sourceLower.includes("novelist")) {
    category = "Writer";
    occupation = "Writer";
  } else if (sourceLower.includes("politician") || sourceLower.includes("president") || sourceLower.includes("minister")) {
    category = "Political Leader";
    occupation = "Politician";
  } else if (sourceLower.includes("scientist") || sourceLower.includes("physicist") || sourceLower.includes("chemist")) {
    category = "Scientist";
    occupation = "Scientist";
  } else if (sourceLower.includes("artist") || sourceLower.includes("painter") || sourceLower.includes("photographer")) {
    category = "Artist";
    occupation = "Artist";
  } else if (sourceLower.includes("director") || sourceLower.includes("filmmaker")) {
    category = "Director";
    occupation = "Director";
  } else if (sourceLower.includes("athlete") || sourceLower.includes("player") || sourceLower.includes("olympic")) {
    category = "Athlete";
    occupation = "Athlete";
  } else if (sourceLower.includes("inventor") || sourceLower.includes("engineer")) {
    category = "Inventor";
    occupation = "Inventor";
  } else if (sourceLower.includes("business") || sourceLower.includes("entrepreneur")) {
    category = "Entrepreneur";
    occupation = "Entrepreneur";
  } else if (sourceLower.includes("military")) {
    category = "Military Leader";
    occupation = "Military Officer";
  } else if (sourceLower.includes("royal") || sourceLower.includes("monarch") || sourceLower.includes("king") || sourceLower.includes("queen")) {
    category = "Royal";
    occupation = "Monarch";
  } else if (sourceLower.includes("philosopher")) {
    category = "Philosopher";
    occupation = "Philosopher";
  } else if (sourceLower.includes("journalist")) {
    category = "Journalist";
    occupation = "Journalist";
  }
  
  return { category, timeperiod, occupation, nationality };
}

async function gatherTopFamousPeople(): Promise<InsertFamousPerson[]> {
  console.log("🚀 Gathering famous people from high-yield Wikipedia categories...");
  
  const allPeople = new Map<string, PersonCandidate>();
  
  // Collect from all categories
  for (const category of HIGH_YIELD_CATEGORIES) {
    const people = await fetchCategoryMembers(category, 200);
    
    // Filter for person-like titles and add to collection
    for (const person of people) {
      if (isPersonTitle(person.title) && !allPeople.has(person.title)) {
        allPeople.set(person.title, person);
      }
    }
    
    console.log(`📈 Total unique people: ${allPeople.size}`);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n📊 Collected ${allPeople.size} unique people from ${HIGH_YIELD_CATEGORIES.length} categories`);
  
  // Convert to array for processing
  const peopleArray = Array.from(allPeople.values());
  
  // Get pageviews for ranking (process in smaller batches due to API limits)
  console.log("📊 Fetching pageviews for ranking...");
  const pageviews = new Map<string, number>();
  
  const batchSize = 25; // Smaller batches for pageview API
  for (let i = 0; i < Math.min(peopleArray.length, 5000); i += batchSize) {
    const batch = peopleArray.slice(i, i + batchSize);
    
    for (const person of batch) {
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        const formatDate = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');
        
        const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(person.title)}/daily/${formatDate(startDate)}/${formatDate(endDate)}`;
        
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          const totalViews = data.items?.reduce((sum: number, item: any) => sum + item.views, 0) || 0;
          pageviews.set(person.title, totalViews);
        } else {
          pageviews.set(person.title, 1);
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        pageviews.set(person.title, 1);
      }
    }
    
    console.log(`📊 Processed pageviews for batch ${Math.floor(i/batchSize) + 1}`);
  }
  
  // Sort by pageviews and take top performers
  const sortedPeople = peopleArray.sort((a, b) => {
    const viewsA = pageviews.get(a.title) || 0;
    const viewsB = pageviews.get(b.title) || 0;
    return viewsB - viewsA;
  });
  
  // Take top 10,000 or however many we have
  const topPeople = sortedPeople.slice(0, 10000);
  
  console.log(`\n🏆 Selected top ${topPeople.length} most popular people`);
  
  // Convert to database format
  const result: InsertFamousPerson[] = topPeople.map(person => {
    const { category, timeperiod, occupation, nationality } = categorizeAndDetermineMeta(person.title, person.category);
    const views = pageviews.get(person.title) || 0;
    
    return {
      name: person.title,
      category: category,
      timeperiod: timeperiod,
      nationality: nationality,
      occupation: occupation,
      birthYear: null,
      deathYear: null,
      wikipediaTitle: person.title.replace(/\s+/g, '_')
    };
  });
  
  console.log(`\n✅ Prepared ${result.length} famous people for database`);
  
  // Show sample of top results
  console.log("\n🌟 Top 20 most popular people by pageviews:");
  result.slice(0, 20).forEach((person, i) => {
    const views = pageviews.get(person.name) || 0;
    console.log(`${i + 1}. ${person.name} (${person.category}, ${views.toLocaleString()} views)`);
  });
  
  return result;
}

export async function populate10kFamousPeople() {
  try {
    console.log("🗂️ Gathering ~10,000 famous people from Wikipedia...");
    
    const famousPeopleData = await gatherTopFamousPeople();
    
    // Clear existing data
    console.log("🧹 Clearing existing famous people data...");
    await db.delete(famousPeople);
    
    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < famousPeopleData.length; i += batchSize) {
      const batch = famousPeopleData.slice(i, i + batchSize);
      console.log(`📦 Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(famousPeopleData.length/batchSize)} (${batch.length} people)`);
      
      await db.insert(famousPeople).values(batch);
    }
    
    console.log(`\n🎉 SUCCESS! Populated database with ${famousPeopleData.length} famous people!`);
    console.log("🌟 Database contains globally recognized individuals ranked by popularity");
    console.log("📈 All entries verified as person-like and filtered for quality");
    
  } catch (error) {
    console.error("❌ Error populating famous people database:", error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  populate10kFamousPeople()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}