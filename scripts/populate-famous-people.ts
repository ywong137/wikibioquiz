// Script to populate the famous_people database with a curated list of well-known figures
import { db } from "../server/db";
import { famousPeople, type InsertFamousPerson } from "../shared/schema";

// Comprehensive list of famous people across history and contemporary culture
// Sourced from various "greatest/most famous" lists and educational resources
const famousPeopleData: InsertFamousPerson[] = [
  // Ancient Historical Figures
  { name: "Alexander the Great", category: "Historical Figure", timeperiod: "Ancient", nationality: "Macedonian", occupation: "Military Leader", birthYear: -356, deathYear: -323, wikipediaTitle: "Alexander_the_Great" },
  { name: "Julius Caesar", category: "Historical Figure", timeperiod: "Ancient", nationality: "Roman", occupation: "Political Leader", birthYear: -100, deathYear: -44, wikipediaTitle: "Julius_Caesar" },
  { name: "Cleopatra", category: "Historical Figure", timeperiod: "Ancient", nationality: "Egyptian", occupation: "Pharaoh", birthYear: -69, deathYear: -30, wikipediaTitle: "Cleopatra" },
  { name: "Aristotle", category: "Philosopher", timeperiod: "Ancient", nationality: "Greek", occupation: "Philosopher", birthYear: -384, deathYear: -322, wikipediaTitle: "Aristotle" },
  { name: "Plato", category: "Philosopher", timeperiod: "Ancient", nationality: "Greek", occupation: "Philosopher", birthYear: -428, deathYear: -348, wikipediaTitle: "Plato" },
  { name: "Socrates", category: "Philosopher", timeperiod: "Ancient", nationality: "Greek", occupation: "Philosopher", birthYear: -470, deathYear: -399, wikipediaTitle: "Socrates" },
  { name: "Confucius", category: "Philosopher", timeperiod: "Ancient", nationality: "Chinese", occupation: "Philosopher", birthYear: -551, deathYear: -479, wikipediaTitle: "Confucius" },
  { name: "Buddha", category: "Religious Figure", timeperiod: "Ancient", nationality: "Indian", occupation: "Spiritual Teacher", birthYear: -563, deathYear: -483, wikipediaTitle: "Gautama_Buddha" },
  
  // Medieval Figures
  { name: "Charlemagne", category: "Historical Figure", timeperiod: "Medieval", nationality: "Frankish", occupation: "Emperor", birthYear: 747, deathYear: 814, wikipediaTitle: "Charlemagne" },
  { name: "William the Conqueror", category: "Historical Figure", timeperiod: "Medieval", nationality: "Norman", occupation: "King", birthYear: 1028, deathYear: 1087, wikipediaTitle: "William_the_Conqueror" },
  { name: "Joan of Arc", category: "Historical Figure", timeperiod: "Medieval", nationality: "French", occupation: "Military Leader", birthYear: 1412, deathYear: 1431, wikipediaTitle: "Joan_of_Arc" },
  { name: "Marco Polo", category: "Explorer", timeperiod: "Medieval", nationality: "Italian", occupation: "Explorer", birthYear: 1254, deathYear: 1324, wikipediaTitle: "Marco_Polo" },
  { name: "Genghis Khan", category: "Historical Figure", timeperiod: "Medieval", nationality: "Mongol", occupation: "Conqueror", birthYear: 1162, deathYear: 1227, wikipediaTitle: "Genghis_Khan" },
  
  // Renaissance
  { name: "Leonardo da Vinci", category: "Artist", timeperiod: "Renaissance", nationality: "Italian", occupation: "Artist/Inventor", birthYear: 1452, deathYear: 1519, wikipediaTitle: "Leonardo_da_Vinci" },
  { name: "Michelangelo", category: "Artist", timeperiod: "Renaissance", nationality: "Italian", occupation: "Artist", birthYear: 1475, deathYear: 1564, wikipediaTitle: "Michelangelo" },
  { name: "William Shakespeare", category: "Writer", timeperiod: "Renaissance", nationality: "English", occupation: "Playwright", birthYear: 1564, deathYear: 1616, wikipediaTitle: "William_Shakespeare" },
  { name: "Christopher Columbus", category: "Explorer", timeperiod: "Renaissance", nationality: "Italian", occupation: "Explorer", birthYear: 1451, deathYear: 1506, wikipediaTitle: "Christopher_Columbus" },
  { name: "Galileo Galilei", category: "Scientist", timeperiod: "Renaissance", nationality: "Italian", occupation: "Astronomer", birthYear: 1564, deathYear: 1642, wikipediaTitle: "Galileo_Galilei" },
  { name: "Johannes Gutenberg", category: "Inventor", timeperiod: "Renaissance", nationality: "German", occupation: "Inventor", birthYear: 1400, deathYear: 1468, wikipediaTitle: "Johannes_Gutenberg" },
  
  // Early Modern (1600-1800)
  { name: "Isaac Newton", category: "Scientist", timeperiod: "Early Modern", nationality: "English", occupation: "Physicist", birthYear: 1643, deathYear: 1727, wikipediaTitle: "Isaac_Newton" },
  { name: "Mozart", category: "Musician", timeperiod: "Early Modern", nationality: "Austrian", occupation: "Composer", birthYear: 1756, deathYear: 1791, wikipediaTitle: "Wolfgang_Amadeus_Mozart" },
  { name: "Ludwig van Beethoven", category: "Musician", timeperiod: "Early Modern", nationality: "German", occupation: "Composer", birthYear: 1770, deathYear: 1827, wikipediaTitle: "Ludwig_van_Beethoven" },
  { name: "George Washington", category: "Political Leader", timeperiod: "Early Modern", nationality: "American", occupation: "President", birthYear: 1732, deathYear: 1799, wikipediaTitle: "George_Washington" },
  { name: "Benjamin Franklin", category: "Historical Figure", timeperiod: "Early Modern", nationality: "American", occupation: "Polymath", birthYear: 1706, deathYear: 1790, wikipediaTitle: "Benjamin_Franklin" },
  { name: "Napoleon Bonaparte", category: "Historical Figure", timeperiod: "Early Modern", nationality: "French", occupation: "Emperor", birthYear: 1769, deathYear: 1821, wikipediaTitle: "Napoleon" },
  { name: "Marie Antoinette", category: "Historical Figure", timeperiod: "Early Modern", nationality: "French", occupation: "Queen", birthYear: 1755, deathYear: 1793, wikipediaTitle: "Marie_Antoinette" },
  
  // 19th Century
  { name: "Abraham Lincoln", category: "Political Leader", timeperiod: "Modern", nationality: "American", occupation: "President", birthYear: 1809, deathYear: 1865, wikipediaTitle: "Abraham_Lincoln" },
  { name: "Charles Darwin", category: "Scientist", timeperiod: "Modern", nationality: "English", occupation: "Naturalist", birthYear: 1809, deathYear: 1882, wikipediaTitle: "Charles_Darwin" },
  { name: "Queen Victoria", category: "Historical Figure", timeperiod: "Modern", nationality: "British", occupation: "Queen", birthYear: 1819, deathYear: 1901, wikipediaTitle: "Queen_Victoria" },
  { name: "Karl Marx", category: "Philosopher", timeperiod: "Modern", nationality: "German", occupation: "Philosopher", birthYear: 1818, deathYear: 1883, wikipediaTitle: "Karl_Marx" },
  { name: "Vincent van Gogh", category: "Artist", timeperiod: "Modern", nationality: "Dutch", occupation: "Painter", birthYear: 1853, deathYear: 1890, wikipediaTitle: "Vincent_van_Gogh" },
  { name: "Edgar Allan Poe", category: "Writer", timeperiod: "Modern", nationality: "American", occupation: "Writer", birthYear: 1809, deathYear: 1849, wikipediaTitle: "Edgar_Allan_Poe" },
  { name: "Mark Twain", category: "Writer", timeperiod: "Modern", nationality: "American", occupation: "Writer", birthYear: 1835, deathYear: 1910, wikipediaTitle: "Mark_Twain" },
  { name: "Thomas Edison", category: "Inventor", timeperiod: "Modern", nationality: "American", occupation: "Inventor", birthYear: 1847, deathYear: 1931, wikipediaTitle: "Thomas_Edison" },
  { name: "Nikola Tesla", category: "Inventor", timeperiod: "Modern", nationality: "Serbian-American", occupation: "Inventor", birthYear: 1856, deathYear: 1943, wikipediaTitle: "Nikola_Tesla" },
  
  // Early 20th Century
  { name: "Albert Einstein", category: "Scientist", timeperiod: "Modern", nationality: "German-American", occupation: "Physicist", birthYear: 1879, deathYear: 1955, wikipediaTitle: "Albert_Einstein" },
  { name: "Pablo Picasso", category: "Artist", timeperiod: "Modern", nationality: "Spanish", occupation: "Painter", birthYear: 1881, deathYear: 1973, wikipediaTitle: "Pablo_Picasso" },
  { name: "Ernest Hemingway", category: "Writer", timeperiod: "Modern", nationality: "American", occupation: "Writer", birthYear: 1899, deathYear: 1961, wikipediaTitle: "Ernest_Hemingway" },
  { name: "F. Scott Fitzgerald", category: "Writer", timeperiod: "Modern", nationality: "American", occupation: "Writer", birthYear: 1896, deathYear: 1940, wikipediaTitle: "F._Scott_Fitzgerald" },
  { name: "Winston Churchill", category: "Political Leader", timeperiod: "Modern", nationality: "British", occupation: "Prime Minister", birthYear: 1874, deathYear: 1965, wikipediaTitle: "Winston_Churchill" },
  { name: "Franklin D. Roosevelt", category: "Political Leader", timeperiod: "Modern", nationality: "American", occupation: "President", birthYear: 1882, deathYear: 1945, wikipediaTitle: "Franklin_D._Roosevelt" },
  { name: "Adolf Hitler", category: "Historical Figure", timeperiod: "Modern", nationality: "Austrian-German", occupation: "Dictator", birthYear: 1889, deathYear: 1945, wikipediaTitle: "Adolf_Hitler" },
  { name: "Mahatma Gandhi", category: "Political Leader", timeperiod: "Modern", nationality: "Indian", occupation: "Independence Leader", birthYear: 1869, deathYear: 1948, wikipediaTitle: "Mahatma_Gandhi" },
  { name: "Martin Luther King Jr.", category: "Civil Rights Leader", timeperiod: "Modern", nationality: "American", occupation: "Civil Rights Leader", birthYear: 1929, deathYear: 1968, wikipediaTitle: "Martin_Luther_King_Jr." },
  
  // Mid-Late 20th Century
  { name: "John F. Kennedy", category: "Political Leader", timeperiod: "Modern", nationality: "American", occupation: "President", birthYear: 1917, deathYear: 1963, wikipediaTitle: "John_F._Kennedy" },
  { name: "Marilyn Monroe", category: "Actor", timeperiod: "Modern", nationality: "American", occupation: "Actress", birthYear: 1926, deathYear: 1962, wikipediaTitle: "Marilyn_Monroe" },
  { name: "Elvis Presley", category: "Musician", timeperiod: "Modern", nationality: "American", occupation: "Singer", birthYear: 1935, deathYear: 1977, wikipediaTitle: "Elvis_Presley" },
  { name: "John Lennon", category: "Musician", timeperiod: "Modern", nationality: "British", occupation: "Musician", birthYear: 1940, deathYear: 1980, wikipediaTitle: "John_Lennon" },
  { name: "Bob Dylan", category: "Musician", timeperiod: "Modern", nationality: "American", occupation: "Singer-Songwriter", birthYear: 1941, deathYear: null, wikipediaTitle: "Bob_Dylan" },
  { name: "Neil Armstrong", category: "Astronaut", timeperiod: "Modern", nationality: "American", occupation: "Astronaut", birthYear: 1930, deathYear: 2012, wikipediaTitle: "Neil_Armstrong" },
  { name: "Steve Jobs", category: "Entrepreneur", timeperiod: "Contemporary", nationality: "American", occupation: "Entrepreneur", birthYear: 1955, deathYear: 2011, wikipediaTitle: "Steve_Jobs" },
  
  // Contemporary Figures (still alive or recently deceased)
  { name: "Bill Gates", category: "Entrepreneur", timeperiod: "Contemporary", nationality: "American", occupation: "Entrepreneur", birthYear: 1955, deathYear: null, wikipediaTitle: "Bill_Gates" },
  { name: "Oprah Winfrey", category: "Media Personality", timeperiod: "Contemporary", nationality: "American", occupation: "Media Mogul", birthYear: 1954, deathYear: null, wikipediaTitle: "Oprah_Winfrey" },
  { name: "Michael Jackson", category: "Musician", timeperiod: "Contemporary", nationality: "American", occupation: "Singer", birthYear: 1958, deathYear: 2009, wikipediaTitle: "Michael_Jackson" },
  { name: "Madonna", category: "Musician", timeperiod: "Contemporary", nationality: "American", occupation: "Singer", birthYear: 1958, deathYear: null, wikipediaTitle: "Madonna" },
  { name: "Tom Hanks", category: "Actor", timeperiod: "Contemporary", nationality: "American", occupation: "Actor", birthYear: 1956, deathYear: null, wikipediaTitle: "Tom_Hanks" },
  { name: "Leonardo DiCaprio", category: "Actor", timeperiod: "Contemporary", nationality: "American", occupation: "Actor", birthYear: 1974, deathYear: null, wikipediaTitle: "Leonardo_DiCaprio" },
  { name: "Steven Spielberg", category: "Director", timeperiod: "Contemporary", nationality: "American", occupation: "Director", birthYear: 1946, deathYear: null, wikipediaTitle: "Steven_Spielberg" },
  { name: "Barack Obama", category: "Political Leader", timeperiod: "Contemporary", nationality: "American", occupation: "President", birthYear: 1961, deathYear: null, wikipediaTitle: "Barack_Obama" },
  { name: "Nelson Mandela", category: "Political Leader", timeperiod: "Contemporary", nationality: "South African", occupation: "President", birthYear: 1918, deathYear: 2013, wikipediaTitle: "Nelson_Mandela" },
  { name: "Stephen Hawking", category: "Scientist", timeperiod: "Contemporary", nationality: "British", occupation: "Physicist", birthYear: 1942, deathYear: 2018, wikipediaTitle: "Stephen_Hawking" },
  
  // More Modern Figures
  { name: "Princess Diana", category: "Royal", timeperiod: "Contemporary", nationality: "British", occupation: "Princess", birthYear: 1961, deathYear: 1997, wikipediaTitle: "Diana,_Princess_of_Wales" },
  { name: "Pope John Paul II", category: "Religious Figure", timeperiod: "Contemporary", nationality: "Polish", occupation: "Pope", birthYear: 1920, deathYear: 2005, wikipediaTitle: "Pope_John_Paul_II" },
  { name: "Ronald Reagan", category: "Political Leader", timeperiod: "Contemporary", nationality: "American", occupation: "President", birthYear: 1911, deathYear: 2004, wikipediaTitle: "Ronald_Reagan" },
  { name: "Margaret Thatcher", category: "Political Leader", timeperiod: "Contemporary", nationality: "British", occupation: "Prime Minister", birthYear: 1925, deathYear: 2013, wikipediaTitle: "Margaret_Thatcher" },
  
  // International Figures
  { name: "Mao Zedong", category: "Political Leader", timeperiod: "Modern", nationality: "Chinese", occupation: "Chairman", birthYear: 1893, deathYear: 1976, wikipediaTitle: "Mao_Zedong" },
  { name: "Sun Yat-sen", category: "Political Leader", timeperiod: "Modern", nationality: "Chinese", occupation: "Revolutionary", birthYear: 1866, deathYear: 1925, wikipediaTitle: "Sun_Yat-sen" },
  { name: "Emperor Meiji", category: "Historical Figure", timeperiod: "Modern", nationality: "Japanese", occupation: "Emperor", birthYear: 1852, deathYear: 1912, wikipediaTitle: "Emperor_Meiji" },
  { name: "Akira Kurosawa", category: "Director", timeperiod: "Contemporary", nationality: "Japanese", occupation: "Director", birthYear: 1910, deathYear: 1998, wikipediaTitle: "Akira_Kurosawa" },
  { name: "Frida Kahlo", category: "Artist", timeperiod: "Modern", nationality: "Mexican", occupation: "Painter", birthYear: 1907, deathYear: 1954, wikipediaTitle: "Frida_Kahlo" },
  { name: "Diego Rivera", category: "Artist", timeperiod: "Modern", nationality: "Mexican", occupation: "Painter", birthYear: 1886, deathYear: 1957, wikipediaTitle: "Diego_Rivera" },
  { name: "Gabriel García Márquez", category: "Writer", timeperiod: "Contemporary", nationality: "Colombian", occupation: "Writer", birthYear: 1927, deathYear: 2014, wikipediaTitle: "Gabriel_García_Márquez" },
  { name: "Pablo Neruda", category: "Writer", timeperiod: "Modern", nationality: "Chilean", occupation: "Poet", birthYear: 1904, deathYear: 1973, wikipediaTitle: "Pablo_Neruda" },
  
  // More Scientists & Inventors
  { name: "Marie Curie", category: "Scientist", timeperiod: "Modern", nationality: "Polish-French", occupation: "Physicist", birthYear: 1867, deathYear: 1934, wikipediaTitle: "Marie_Curie" },
  { name: "Louis Pasteur", category: "Scientist", timeperiod: "Modern", nationality: "French", occupation: "Microbiologist", birthYear: 1822, deathYear: 1895, wikipediaTitle: "Louis_Pasteur" },
  { name: "Alexander Graham Bell", category: "Inventor", timeperiod: "Modern", nationality: "Scottish-American", occupation: "Inventor", birthYear: 1847, deathYear: 1922, wikipediaTitle: "Alexander_Graham_Bell" },
  { name: "Wright Brothers", category: "Inventor", timeperiod: "Modern", nationality: "American", occupation: "Inventors", birthYear: 1867, deathYear: 1948, wikipediaTitle: "Wright_brothers" },
  
  // More Artists & Writers
  { name: "Andy Warhol", category: "Artist", timeperiod: "Contemporary", nationality: "American", occupation: "Artist", birthYear: 1928, deathYear: 1987, wikipediaTitle: "Andy_Warhol" },
  { name: "Salvador Dalí", category: "Artist", timeperiod: "Modern", nationality: "Spanish", occupation: "Painter", birthYear: 1904, deathYear: 1989, wikipediaTitle: "Salvador_Dalí" },
  { name: "Claude Monet", category: "Artist", timeperiod: "Modern", nationality: "French", occupation: "Painter", birthYear: 1840, deathYear: 1926, wikipediaTitle: "Claude_Monet" },
  { name: "Jane Austen", category: "Writer", timeperiod: "Early Modern", nationality: "English", occupation: "Writer", birthYear: 1775, deathYear: 1817, wikipediaTitle: "Jane_Austen" },
  { name: "Charles Dickens", category: "Writer", timeperiod: "Modern", nationality: "English", occupation: "Writer", birthYear: 1812, deathYear: 1870, wikipediaTitle: "Charles_Dickens" },
  { name: "Virginia Woolf", category: "Writer", timeperiod: "Modern", nationality: "English", occupation: "Writer", birthYear: 1882, deathYear: 1941, wikipediaTitle: "Virginia_Woolf" },
  { name: "George Orwell", category: "Writer", timeperiod: "Modern", nationality: "English", occupation: "Writer", birthYear: 1903, deathYear: 1950, wikipediaTitle: "George_Orwell" },
  { name: "J.K. Rowling", category: "Writer", timeperiod: "Contemporary", nationality: "British", occupation: "Writer", birthYear: 1965, deathYear: null, wikipediaTitle: "J._K._Rowling" },
  
  // More Musicians
  { name: "Johann Sebastian Bach", category: "Musician", timeperiod: "Early Modern", nationality: "German", occupation: "Composer", birthYear: 1685, deathYear: 1750, wikipediaTitle: "Johann_Sebastian_Bach" },
  { name: "Freddie Mercury", category: "Musician", timeperiod: "Contemporary", nationality: "British", occupation: "Singer", birthYear: 1946, deathYear: 1991, wikipediaTitle: "Freddie_Mercury" },
  { name: "David Bowie", category: "Musician", timeperiod: "Contemporary", nationality: "British", occupation: "Singer", birthYear: 1947, deathYear: 2016, wikipediaTitle: "David_Bowie" },
  { name: "Prince", category: "Musician", timeperiod: "Contemporary", nationality: "American", occupation: "Singer", birthYear: 1958, deathYear: 2016, wikipediaTitle: "Prince_(musician)" },
  { name: "Whitney Houston", category: "Musician", timeperiod: "Contemporary", nationality: "American", occupation: "Singer", birthYear: 1963, deathYear: 2012, wikipediaTitle: "Whitney_Houston" },
  { name: "Aretha Franklin", category: "Musician", timeperiod: "Contemporary", nationality: "American", occupation: "Singer", birthYear: 1942, deathYear: 2018, wikipediaTitle: "Aretha_Franklin" },
  
  // More Actors & Directors
  { name: "Charlie Chaplin", category: "Actor", timeperiod: "Modern", nationality: "British", occupation: "Actor/Director", birthYear: 1889, deathYear: 1977, wikipediaTitle: "Charlie_Chaplin" },
  { name: "Alfred Hitchcock", category: "Director", timeperiod: "Modern", nationality: "British", occupation: "Director", birthYear: 1899, deathYear: 1980, wikipediaTitle: "Alfred_Hitchcock" },
  { name: "Audrey Hepburn", category: "Actor", timeperiod: "Modern", nationality: "British", occupation: "Actress", birthYear: 1929, deathYear: 1993, wikipediaTitle: "Audrey_Hepburn" },
  { name: "Humphrey Bogart", category: "Actor", timeperiod: "Modern", nationality: "American", occupation: "Actor", birthYear: 1899, deathYear: 1957, wikipediaTitle: "Humphrey_Bogart" },
  { name: "James Dean", category: "Actor", timeperiod: "Modern", nationality: "American", occupation: "Actor", birthYear: 1931, deathYear: 1955, wikipediaTitle: "James_Dean" },
  { name: "Meryl Streep", category: "Actor", timeperiod: "Contemporary", nationality: "American", occupation: "Actress", birthYear: 1949, deathYear: null, wikipediaTitle: "Meryl_Streep" },
  { name: "Robert De Niro", category: "Actor", timeperiod: "Contemporary", nationality: "American", occupation: "Actor", birthYear: 1943, deathYear: null, wikipediaTitle: "Robert_De_Niro" },
  { name: "Al Pacino", category: "Actor", timeperiod: "Contemporary", nationality: "American", occupation: "Actor", birthYear: 1940, deathYear: null, wikipediaTitle: "Al_Pacino" },
  
  // Sports Figures
  { name: "Muhammad Ali", category: "Athlete", timeperiod: "Contemporary", nationality: "American", occupation: "Boxer", birthYear: 1942, deathYear: 2016, wikipediaTitle: "Muhammad_Ali" },
  { name: "Michael Jordan", category: "Athlete", timeperiod: "Contemporary", nationality: "American", occupation: "Basketball Player", birthYear: 1963, deathYear: null, wikipediaTitle: "Michael_Jordan" },
  { name: "Babe Ruth", category: "Athlete", timeperiod: "Modern", nationality: "American", occupation: "Baseball Player", birthYear: 1895, deathYear: 1948, wikipediaTitle: "Babe_Ruth" },
  { name: "Pelé", category: "Athlete", timeperiod: "Contemporary", nationality: "Brazilian", occupation: "Soccer Player", birthYear: 1940, deathYear: 2022, wikipediaTitle: "Pelé" },
  { name: "Diego Maradona", category: "Athlete", timeperiod: "Contemporary", nationality: "Argentine", occupation: "Soccer Player", birthYear: 1960, deathYear: 2020, wikipediaTitle: "Diego_Maradona" },
  { name: "Serena Williams", category: "Athlete", timeperiod: "Contemporary", nationality: "American", occupation: "Tennis Player", birthYear: 1981, deathYear: null, wikipediaTitle: "Serena_Williams" },
  { name: "Tiger Woods", category: "Athlete", timeperiod: "Contemporary", nationality: "American", occupation: "Golfer", birthYear: 1975, deathYear: null, wikipediaTitle: "Tiger_Woods" },
  { name: "Jesse Owens", category: "Athlete", timeperiod: "Modern", nationality: "American", occupation: "Track and Field", birthYear: 1913, deathYear: 1980, wikipediaTitle: "Jesse_Owens" },
  
  // Additional International Figures
  { name: "Jawaharlal Nehru", category: "Political Leader", timeperiod: "Modern", nationality: "Indian", occupation: "Prime Minister", birthYear: 1889, deathYear: 1964, wikipediaTitle: "Jawaharlal_Nehru" },
  { name: "Ho Chi Minh", category: "Political Leader", timeperiod: "Modern", nationality: "Vietnamese", occupation: "Revolutionary", birthYear: 1890, deathYear: 1969, wikipediaTitle: "Ho_Chi_Minh" },
  { name: "Indira Gandhi", category: "Political Leader", timeperiod: "Contemporary", nationality: "Indian", occupation: "Prime Minister", birthYear: 1917, deathYear: 1984, wikipediaTitle: "Indira_Gandhi" },
  { name: "Golda Meir", category: "Political Leader", timeperiod: "Contemporary", nationality: "Israeli", occupation: "Prime Minister", birthYear: 1898, deathYear: 1978, wikipediaTitle: "Golda_Meir" },
  { name: "Anwar Sadat", category: "Political Leader", timeperiod: "Contemporary", nationality: "Egyptian", occupation: "President", birthYear: 1918, deathYear: 1981, wikipediaTitle: "Anwar_Sadat" },
  { name: "Mikhail Gorbachev", category: "Political Leader", timeperiod: "Contemporary", nationality: "Russian", occupation: "Soviet Leader", birthYear: 1931, deathYear: 2022, wikipediaTitle: "Mikhail_Gorbachev" },
  { name: "Vladimir Putin", category: "Political Leader", timeperiod: "Contemporary", nationality: "Russian", occupation: "President", birthYear: 1952, deathYear: null, wikipediaTitle: "Vladimir_Putin" },
  
  // Tech Pioneers
  { name: "Mark Zuckerberg", category: "Entrepreneur", timeperiod: "Contemporary", nationality: "American", occupation: "Entrepreneur", birthYear: 1984, deathYear: null, wikipediaTitle: "Mark_Zuckerberg" },
  { name: "Elon Musk", category: "Entrepreneur", timeperiod: "Contemporary", nationality: "South African-American", occupation: "Entrepreneur", birthYear: 1971, deathYear: null, wikipediaTitle: "Elon_Musk" },
  { name: "Jeff Bezos", category: "Entrepreneur", timeperiod: "Contemporary", nationality: "American", occupation: "Entrepreneur", birthYear: 1964, deathYear: null, wikipediaTitle: "Jeff_Bezos" },
  { name: "Larry Page", category: "Entrepreneur", timeperiod: "Contemporary", nationality: "American", occupation: "Entrepreneur", birthYear: 1973, deathYear: null, wikipediaTitle: "Larry_Page" },
  { name: "Sergey Brin", category: "Entrepreneur", timeperiod: "Contemporary", nationality: "Russian-American", occupation: "Entrepreneur", birthYear: 1973, deathYear: null, wikipediaTitle: "Sergey_Brin" },
  
  // Additional Cultural Icons
  { name: "Walt Disney", category: "Entrepreneur", timeperiod: "Modern", nationality: "American", occupation: "Animator/Entrepreneur", birthYear: 1901, deathYear: 1966, wikipediaTitle: "Walt_Disney" },
  { name: "Dr. Seuss", category: "Writer", timeperiod: "Modern", nationality: "American", occupation: "Children's Author", birthYear: 1904, deathYear: 1991, wikipediaTitle: "Dr._Seuss" },
  { name: "Stan Lee", category: "Writer", timeperiod: "Contemporary", nationality: "American", occupation: "Comic Book Writer", birthYear: 1922, deathYear: 2018, wikipediaTitle: "Stan_Lee" },
  { name: "Jim Henson", category: "Entertainer", timeperiod: "Contemporary", nationality: "American", occupation: "Puppeteer", birthYear: 1936, deathYear: 1990, wikipediaTitle: "Jim_Henson" },
];

export async function populateFamousPeople() {
  console.log("🚀 Starting to populate famous people database...");
  
  try {
    // Clear existing data (optional - remove if you want to keep existing data)
    console.log("🧹 Clearing existing famous people data...");
    await db.delete(famousPeople);
    
    // Insert new data in batches to avoid memory issues
    const batchSize = 50;
    for (let i = 0; i < famousPeopleData.length; i += batchSize) {
      const batch = famousPeopleData.slice(i, i + batchSize);
      console.log(`📦 Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(famousPeopleData.length/batchSize)} (${batch.length} people)`);
      
      await db.insert(famousPeople).values(batch);
    }
    
    console.log(`✅ Successfully populated database with ${famousPeopleData.length} famous people!`);
    console.log("🎯 Database now contains a curated list of historically significant and culturally famous individuals");
    
  } catch (error) {
    console.error("❌ Error populating famous people database:", error);
    throw error;
  }
}

// Run the population script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  populateFamousPeople()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}