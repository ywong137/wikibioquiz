// Load top 10,000 famous people from authentic Pantheon 2.0 dataset
import { db } from "../server/db";
import { famousPeople, type InsertFamousPerson } from "../shared/schema";
import fs from 'fs';

async function loadPantheon10k() {
  try {
    console.log("🏛️ Loading top 10,000 famous people from Pantheon 2.0 dataset...");
    
    // Read the decompressed CSV file
    const csvContent = fs.readFileSync('./pantheon.csv', 'utf-8');
    const lines = csvContent.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, ''));
    
    console.log("📊 Dataset info:");
    console.log(`   Total records: ${lines.length - 1}`);
    console.log(`   Headers: ${headers.slice(0, 10).join(', ')}...`);
    
    // Find column indices
    const nameIndex = headers.indexOf('name');
    const occupationIndex = headers.indexOf('occupation');
    const birthyearIndex = headers.indexOf('birthyear');
    const deathyearIndex = headers.indexOf('deathyear');
    const hpiIndex = headers.indexOf('hpi');
    const bplaceCountryIndex = headers.indexOf('bplace_country');
    const slugIndex = headers.indexOf('slug');
    
    console.log("🔍 Column mapping:");
    console.log(`   name: ${nameIndex}, occupation: ${occupationIndex}, hpi: ${hpiIndex}`);
    console.log(`   birth: ${birthyearIndex}, death: ${deathyearIndex}, country: ${bplaceCountryIndex}`);
    
    const famousPeopleData: InsertFamousPerson[] = [];
    const seenNames = new Set<string>();
    
    // Process lines (skip header, take top 10,000 by HPI ranking)
    for (let i = 1; i < lines.length && famousPeopleData.length < 10000; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Parse CSV with quoted fields
      const fields = parseCsvLine(line);
      
      const name = cleanField(fields[nameIndex]);
      const occupation = cleanField(fields[occupationIndex]) || "Notable Person";
      const birthYear = fields[birthyearIndex] ? parseInt(cleanField(fields[birthyearIndex])) : null;
      const deathYear = fields[deathyearIndex] ? parseInt(cleanField(fields[deathyearIndex])) : null;
      const hpi = fields[hpiIndex] ? parseFloat(cleanField(fields[hpiIndex])) : 0;
      const country = cleanField(fields[bplaceCountryIndex]) || "International";
      const slug = cleanField(fields[slugIndex]) || name?.replace(/\s+/g, '_');
      
      if (!name || name.length < 2 || seenNames.has(name)) continue;
      
      seenNames.add(name);
      
      // Map occupation to our categories
      let category = mapOccupationToCategory(occupation);
      
      // Determine time period from birth year
      let timeperiod = determineTimePeriod(birthYear);
      
      // Map country to nationality
      let nationality = mapCountryToNationality(country);
      
      famousPeopleData.push({
        name: name,
        category: category,
        timeperiod: timeperiod,
        nationality: nationality,
        occupation: occupation,
        birthYear: birthYear,
        deathYear: deathYear,
        wikipediaTitle: slug
      });
      
      if (i % 1000 === 0) {
        console.log(`📈 Processed ${i} entries... Current: ${name} (HPI: ${hpi.toFixed(1)})`);
      }
    }
    
    console.log(`\n✅ Extracted ${famousPeopleData.length} famous people from Pantheon dataset`);
    
    // Clear existing data
    console.log("🧹 Clearing existing famous people data...");
    await db.delete(famousPeople);
    
    // Insert in batches
    console.log("📦 Inserting famous people into database...");
    const batchSize = 100;
    for (let i = 0; i < famousPeopleData.length; i += batchSize) {
      const batch = famousPeopleData.slice(i, i + batchSize);
      await db.insert(famousPeople).values(batch);
      
      if ((i / batchSize + 1) % 10 === 0) {
        console.log(`📦 Inserted batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(famousPeopleData.length/batchSize)}`);
      }
    }
    
    console.log(`\n🎉 SUCCESS! Database populated with ${famousPeopleData.length} famous people from Pantheon 2.0!`);
    console.log("📊 Pantheon 2.0 is MIT's authoritative dataset of globally famous historical figures");
    console.log("🌍 Ranked by Historical Popularity Index across all cultures and time periods");
    
    // Show breakdown
    const categoryBreakdown = new Map<string, number>();
    const periodBreakdown = new Map<string, number>();
    const nationalityBreakdown = new Map<string, number>();
    
    famousPeopleData.forEach(person => {
      categoryBreakdown.set(person.category, (categoryBreakdown.get(person.category) || 0) + 1);
      periodBreakdown.set(person.timeperiod, (periodBreakdown.get(person.timeperiod) || 0) + 1);
      nationalityBreakdown.set(person.nationality, (nationalityBreakdown.get(person.nationality) || 0) + 1);
    });
    
    console.log("\n📊 Top categories:");
    Array.from(categoryBreakdown.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([category, count]) => {
        console.log(`   ${category}: ${count}`);
      });
    
    console.log("\n🕰️ Time periods:");
    Array.from(periodBreakdown.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([period, count]) => {
        console.log(`   ${period}: ${count}`);
      });
    
    console.log("\n🌍 Top nationalities:");
    Array.from(nationalityBreakdown.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([nationality, count]) => {
        console.log(`   ${nationality}: ${count}`);
      });
    
    // Show top 20 most famous people
    console.log("\n🌟 Top 20 most famous people in dataset:");
    famousPeopleData.slice(0, 20).forEach((person, i) => {
      console.log(`${i + 1}. ${person.name} (${person.category}, ${person.timeperiod})`);
    });
    
  } catch (error) {
    console.error("❌ Error loading Pantheon dataset:", error);
    throw error;
  }
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  fields.push(current);
  
  return fields;
}

function cleanField(field: string | undefined): string {
  if (!field) return '';
  return field.replace(/^"|"$/g, '').trim();
}

function mapOccupationToCategory(occupation: string): string {
  const occ = occupation.toLowerCase();
  
  if (occ.includes('politician') || occ.includes('politician') || occ.includes('head of state') || occ.includes('head of government')) {
    return "Political Leader";
  } else if (occ.includes('religious') || occ.includes('priest') || occ.includes('monk') || occ.includes('missionary')) {
    return "Religious Leader";
  } else if (occ.includes('military') || occ.includes('general') || occ.includes('admiral') || occ.includes('soldier')) {
    return "Military Leader";
  } else if (occ.includes('scientist') || occ.includes('physicist') || occ.includes('chemist') || occ.includes('biologist') || occ.includes('mathematician')) {
    return "Scientist";
  } else if (occ.includes('writer') || occ.includes('author') || occ.includes('novelist') || occ.includes('poet') || occ.includes('journalist')) {
    return "Writer";
  } else if (occ.includes('artist') || occ.includes('painter') || occ.includes('sculptor') || occ.includes('photographer')) {
    return "Artist";
  } else if (occ.includes('musician') || occ.includes('composer') || occ.includes('singer') || occ.includes('conductor')) {
    return "Musician";
  } else if (occ.includes('actor') || occ.includes('actress') || occ.includes('performer')) {
    return "Actor";
  } else if (occ.includes('athlete') || occ.includes('player') || occ.includes('sport')) {
    return "Athlete";
  } else if (occ.includes('philosopher') || occ.includes('thinker')) {
    return "Philosopher";
  } else if (occ.includes('inventor') || occ.includes('engineer')) {
    return "Inventor";
  } else if (occ.includes('explorer') || occ.includes('navigator')) {
    return "Explorer";
  } else if (occ.includes('director') || occ.includes('filmmaker')) {
    return "Director";
  } else if (occ.includes('business') || occ.includes('entrepreneur') || occ.includes('industrialist')) {
    return "Entrepreneur";
  } else {
    return "Historical Figure";
  }
}

function determineTimePeriod(birthYear: number | null): string {
  if (!birthYear) return "Ancient";
  
  if (birthYear >= 1950) return "Contemporary";
  else if (birthYear >= 1800) return "Modern";
  else if (birthYear >= 1450) return "Renaissance";
  else if (birthYear >= 1000) return "Medieval";
  else if (birthYear >= 500) return "Early Medieval";
  else return "Ancient";
}

function mapCountryToNationality(country: string): string {
  if (!country) return "International";
  
  const countryMap: { [key: string]: string } = {
    'United States': 'American',
    'United Kingdom': 'British', 
    'England': 'English',
    'France': 'French',
    'Germany': 'German',
    'Italy': 'Italian',
    'Spain': 'Spanish',
    'Russia': 'Russian',
    'China': 'Chinese',
    'Japan': 'Japanese',
    'India': 'Indian',
    'Brazil': 'Brazilian',
    'Canada': 'Canadian',
    'Australia': 'Australian',
    'Netherlands': 'Dutch',
    'Sweden': 'Swedish',
    'Norway': 'Norwegian',
    'Denmark': 'Danish',
    'Finland': 'Finnish',
    'Poland': 'Polish',
    'Greece': 'Greek',
    'Egypt': 'Egyptian',
    'Iran': 'Persian',
    'Turkey': 'Turkish',
    'Mexico': 'Mexican',
    'Argentina': 'Argentine',
    'Switzerland': 'Swiss',
    'Austria': 'Austrian',
    'Belgium': 'Belgian',
    'Portugal': 'Portuguese',
    'Ireland': 'Irish',
    'Israel': 'Israeli',
    'South Africa': 'South African',
    'South Korea': 'Korean',
    'Thailand': 'Thai',
    'Vietnam': 'Vietnamese',
    'Indonesia': 'Indonesian',
    'Philippines': 'Filipino',
    'Chile': 'Chilean',
    'Peru': 'Peruvian',
    'Colombia': 'Colombian',
    'Venezuela': 'Venezuelan',
    'Czech Republic': 'Czech',
    'Hungary': 'Hungarian',
    'Romania': 'Romanian',
    'Ukraine': 'Ukrainian',
    'Belarus': 'Belarusian',
    'Lithuania': 'Lithuanian',
    'Latvia': 'Latvian',
    'Estonia': 'Estonian'
  };
  
  return countryMap[country] || country;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  loadPantheon10k()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}