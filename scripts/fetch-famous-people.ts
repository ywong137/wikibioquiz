// Script to fetch thousands of famous people from Wikipedia using category mining and pageview ranking
import { db } from "../server/db";
import { famousPeople, type InsertFamousPerson } from "../shared/schema";

interface WikipediaPage {
  title: string;
  pageid: number;
  extract?: string;
}

interface PageviewData {
  article: string;
  views: number;
}

// Comprehensive list of Wikipedia categories that contain famous people
const PEOPLE_CATEGORIES = [
  // Historical periods
  "Ancient_Greek_people",
  "Ancient_Roman_people", 
  "Medieval_people",
  "Renaissance_people",
  "Enlightenment_people",
  "19th-century_people",
  "20th-century_people",
  "21st-century_people",
  
  // By profession - broad categories
  "Politicians",
  "Political_leaders", 
  "Heads_of_state",
  "Presidents",
  "Prime_ministers",
  "Monarchs",
  "Military_personnel",
  "Military_leaders",
  
  // Arts and entertainment
  "Actors",
  "Film_actors", 
  "Television_actors",
  "Film_directors",
  "Musicians",
  "Singers", 
  "Composers",
  "Classical_composers",
  "Rock_musicians",
  "Pop_musicians",
  "Jazz_musicians",
  "Artists",
  "Painters",
  "Sculptors",
  "Writers",
  "Novelists",
  "Poets",
  "Playwrights",
  "Journalists",
  
  // Science and technology
  "Scientists",
  "Physicists",
  "Chemists", 
  "Biologists",
  "Mathematicians",
  "Engineers",
  "Inventors",
  "Computer_scientists",
  "Nobel_Prize_laureates",
  "Astronauts",
  
  // Business and entrepreneurship
  "Businesspeople",
  "Entrepreneurs",
  "Chief_executives",
  
  // Sports
  "Sportspeople",
  "Olympic_athletes",
  "Football_players",
  "Basketball_players",
  "Baseball_players",
  "Tennis_players",
  "Golfers",
  "Boxers",
  
  // Religion and philosophy
  "Religious_leaders",
  "Philosophers",
  "Theologians",
  
  // Nationality-based (major countries)
  "American_people",
  "British_people", 
  "French_people",
  "German_people",
  "Italian_people",
  "Russian_people",
  "Chinese_people",
  "Japanese_people",
  "Indian_people",
  "Canadian_people",
  "Australian_people",
  "Brazilian_people",
  "Mexican_people",
  "Spanish_people",
  
  // More specific high-value categories
  "Academy_Award_winners",
  "Grammy_Award_winners",
  "Emmy_Award_winners",
  "Tony_Award_winners",
  "Pulitzer_Prize_winners",
  "Rock_and_Roll_Hall_of_Fame_inductees",
  "Hollywood_Walk_of_Fame_honorees",
  "Presidential_Medal_of_Freedom_recipients",
  "Members_of_the_Order_of_the_British_Empire",
  
  // Time Magazine lists
  "Time_Person_of_the_Year",
  
  // Forbes lists (converted to Wikipedia categories)
  "Forbes_lists_of_people"
];

async function fetchCategoryMembers(category: string, limit: number = 500): Promise<WikipediaPage[]> {
  console.log(`🔍 Fetching from category: ${category}`);
  
  try {
    const url = `https://en.wikipedia.org/w/api.php?` +
      `action=query&` +
      `list=categorymembers&` +
      `cmtitle=Category:${category}&` +
      `cmlimit=${limit}&` +
      `format=json&` +
      `origin=*&` +
      `cmnamespace=0`; // Only main namespace (articles)
    
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`⚠️ Failed to fetch category ${category}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    const members = data.query?.categorymembers || [];
    
    console.log(`📄 Found ${members.length} pages in ${category}`);
    return members.map((member: any) => ({
      title: member.title,
      pageid: member.pageid
    }));
    
  } catch (error) {
    console.log(`❌ Error fetching category ${category}: ${error}`);
    return [];
  }
}

async function getPageviews(articles: string[]): Promise<Map<string, number>> {
  console.log(`📊 Fetching pageviews for ${articles.length} articles...`);
  
  const pageviews = new Map<string, number>();
  
  // Process in batches to avoid API limits
  const batchSize = 50;
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    
    try {
      // Get pageviews for the last 30 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      
      const formatDate = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');
      
      for (const article of batch) {
        try {
          const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(article)}/daily/${formatDate(startDate)}/${formatDate(endDate)}`;
          
          const response = await fetch(url);
          if (response.ok) {
            const data = await response.json();
            const totalViews = data.items?.reduce((sum: number, item: any) => sum + item.views, 0) || 0;
            pageviews.set(article, totalViews);
          } else {
            // If pageviews API fails, assign a default low value
            pageviews.set(article, 1);
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          pageviews.set(article, 1);
        }
      }
      
      console.log(`📊 Processed pageviews for batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(articles.length/batchSize)}`);
      
    } catch (error) {
      console.log(`⚠️ Error processing pageviews batch: ${error}`);
      // Assign default values for this batch
      for (const article of batch) {
        pageviews.set(article, 1);
      }
    }
  }
  
  return pageviews;
}

async function isValidPersonPage(title: string): Promise<boolean> {
  try {
    // Get page summary to check if it's about a person
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const response = await fetch(url);
    
    if (!response.ok) return false;
    
    const data = await response.json();
    const extract = (data.extract || "").toLowerCase();
    
    // Check for person indicators
    const personIndicators = [
      " was a ", " was an ", " is a ", " is an ",
      " born ", " died ", " birth ", " death ",
      " he ", " she ", " his ", " her ",
      "actor", "actress", "singer", "musician", "writer", "author",
      "politician", "president", "minister", "king", "queen",
      "scientist", "physicist", "chemist", "mathematician",
      "artist", "painter", "composer", "director",
      "athlete", "player", "boxer", "tennis"
    ];
    
    const hasPersonIndicator = personIndicators.some(indicator => extract.includes(indicator));
    
    // Exclude common non-person pages
    const excludePatterns = [
      "disambiguation", "album", "film", "movie", "book", "song",
      "company", "organization", "building", "place", "city",
      "country", "university", "school", "award", "prize",
      "list of", "category:"
    ];
    
    const hasExcludePattern = excludePatterns.some(pattern => 
      title.toLowerCase().includes(pattern) || extract.includes(pattern)
    );
    
    return hasPersonIndicator && !hasExcludePattern;
    
  } catch (error) {
    return false;
  }
}

function categorizePersonByTitle(title: string): { category: string; timeperiod: string; occupation: string } {
  const titleLower = title.toLowerCase();
  
  // Determine category based on title patterns
  let category = "Historical Figure";
  let occupation = "Notable Person";
  let timeperiod = "Modern";
  
  // Categories
  if (titleLower.includes("president") || titleLower.includes("minister") || 
      titleLower.includes("politician") || titleLower.includes("senator")) {
    category = "Political Leader";
    occupation = "Politician";
  } else if (titleLower.includes("actor") || titleLower.includes("actress")) {
    category = "Actor";
    occupation = "Actor";
  } else if (titleLower.includes("singer") || titleLower.includes("musician") || 
             titleLower.includes("composer") || titleLower.includes("band")) {
    category = "Musician";
    occupation = "Musician";
  } else if (titleLower.includes("writer") || titleLower.includes("author") || 
             titleLower.includes("novelist") || titleLower.includes("poet")) {
    category = "Writer";
    occupation = "Writer";
  } else if (titleLower.includes("scientist") || titleLower.includes("physicist") || 
             titleLower.includes("chemist") || titleLower.includes("mathematician")) {
    category = "Scientist";
    occupation = "Scientist";
  } else if (titleLower.includes("artist") || titleLower.includes("painter") || 
             titleLower.includes("sculptor")) {
    category = "Artist";
    occupation = "Artist";
  } else if (titleLower.includes("athlete") || titleLower.includes("player") || 
             titleLower.includes("tennis") || titleLower.includes("boxer")) {
    category = "Athlete";
    occupation = "Athlete";
  } else if (titleLower.includes("director") || titleLower.includes("filmmaker")) {
    category = "Director";
    occupation = "Director";
  } else if (titleLower.includes("inventor") || titleLower.includes("engineer")) {
    category = "Inventor";
    occupation = "Inventor";
  } else if (titleLower.includes("entrepreneur") || titleLower.includes("businessman")) {
    category = "Entrepreneur";
    occupation = "Entrepreneur";
  }
  
  return { category, timeperiod, occupation };
}

async function gatherFamousPeople(): Promise<InsertFamousPerson[]> {
  console.log("🚀 Starting comprehensive famous people gathering...");
  
  const allPeople = new Map<string, WikipediaPage>();
  
  // Fetch from all categories
  for (const category of PEOPLE_CATEGORIES) {
    const pages = await fetchCategoryMembers(category, 200); // Limit per category to manage volume
    
    for (const page of pages) {
      if (!allPeople.has(page.title)) {
        allPeople.set(page.title, page);
      }
    }
    
    // Rate limiting between categories
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`📈 Total unique people collected: ${allPeople.size}`);
  }
  
  console.log(`\n📊 Collected ${allPeople.size} unique people from ${PEOPLE_CATEGORIES.length} categories`);
  
  // Filter for valid person pages
  console.log("🔍 Filtering for valid person pages...");
  const validPeople: WikipediaPage[] = [];
  
  const peopleArray = Array.from(allPeople.values());
  const batchSize = 20;
  
  for (let i = 0; i < peopleArray.length; i += batchSize) {
    const batch = peopleArray.slice(i, i + batchSize);
    
    const validityPromises = batch.map(async (person) => {
      const isValid = await isValidPersonPage(person.title);
      return isValid ? person : null;
    });
    
    const results = await Promise.all(validityPromises);
    validPeople.push(...results.filter(person => person !== null));
    
    console.log(`✅ Validated batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(peopleArray.length/batchSize)} - Valid people: ${validPeople.length}`);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n📋 ${validPeople.length} valid people found after filtering`);
  
  // Get pageviews for ranking
  const articles = validPeople.map(p => p.title);
  const pageviews = await getPageviews(articles);
  
  // Sort by pageviews (popularity)
  const sortedPeople = validPeople.sort((a, b) => {
    const viewsA = pageviews.get(a.title) || 0;
    const viewsB = pageviews.get(b.title) || 0;
    return viewsB - viewsA;
  });
  
  // Take top 10,000 (or however many we have)
  const topPeople = sortedPeople.slice(0, 10000);
  
  console.log(`\n🏆 Selected top ${topPeople.length} most popular people`);
  
  // Convert to database format
  const famousPeopleData: InsertFamousPerson[] = topPeople.map((person, index) => {
    const { category, timeperiod, occupation } = categorizePersonByTitle(person.title);
    const views = pageviews.get(person.title) || 0;
    
    // Clean the title for Wikipedia lookup
    const wikipediaTitle = person.title.replace(/\s+/g, '_');
    
    return {
      name: person.title,
      category: category,
      timeperiod: timeperiod,
      nationality: "International", // Default - could be enhanced with more analysis
      occupation: occupation,
      birthYear: null, // Could be extracted from page content if needed
      deathYear: null,
      wikipediaTitle: wikipediaTitle
    };
  });
  
  console.log(`\n✅ Prepared ${famousPeopleData.length} people for database insertion`);
  
  return famousPeopleData;
}

export async function populateFamousPeopleFromWikipedia() {
  try {
    console.log("🗂️ Gathering famous people from Wikipedia categories and pageviews...");
    
    const famousPeopleData = await gatherFamousPeople();
    
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
    console.log("🌟 Database now contains a comprehensive collection of globally famous individuals");
    console.log("📈 Ranked by Wikipedia pageviews for maximum recognizability");
    
  } catch (error) {
    console.error("❌ Error populating famous people database:", error);
    throw error;
  }
}

// Run the population script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  populateFamousPeopleFromWikipedia()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}