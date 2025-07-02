import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNull, sql, and } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface WikipediaSection {
  toclevel: number;
  level: string;
  line: string;
  number: string;
  index: string;
  fromtitle: string;
  byteoffset: number;
  anchor: string;
}

async function fetchWikipediaData(wikipediaTitle: string) {
  const baseUrl = 'https://en.wikipedia.org/api/rest_v1';
  
  try {
    // First get the page summary to ensure it exists
    const summaryResponse = await fetch(`${baseUrl}/page/summary/${wikipediaTitle}`);
    if (!summaryResponse.ok) {
      throw new Error(`Summary API returned ${summaryResponse.status}`);
    }
    
    // Get the full page content using the correct API
    const pageResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${wikipediaTitle}&format=json&prop=sections&formatversion=2`);
    if (!pageResponse.ok) {
      throw new Error(`Parse API returned ${pageResponse.status}`);
    }
    
    const pageData = await pageResponse.json();
    
    if (pageData.error) {
      throw new Error(`Wikipedia API error: ${pageData.error.info}`);
    }
    
    const sections = pageData.parse?.sections || [];
    const sectionTitles = sections.map((section: WikipediaSection) => section.line || section.anchor || 'Unknown').filter(Boolean);
    
    return {
      sections: sectionTitles,
      extract: pageData.parse?.displaytitle || wikipediaTitle
    };
    
  } catch (error) {
    return { sections: [], extract: '' };
  }
}

function generateInitials(fullName: string): string {
  // Handle "X of Y" patterns
  if (fullName.includes(' of ')) {
    const parts = fullName.split(' of ');
    const beforeOf = parts[0].trim().split(' ').map(word => word.charAt(0).toUpperCase()).join('. ');
    const afterOf = parts[1].trim().split(' ').map(word => word.charAt(0).toUpperCase()).join('. ');
    return `${beforeOf} of ${afterOf}`;
  }
  
  // Regular name processing
  const nameParts = fullName.trim().split(/\s+/);
  if (nameParts.length === 1) {
    return nameParts[0].charAt(0).toUpperCase() + '.';
  }
  
  return nameParts.map(part => part.charAt(0).toUpperCase()).join('. ') + '.';
}

async function generateBasicHint(person: any): Promise<string> {
  const hints = [
    `Famous ${person.occupation} from the ${person.timeperiod} period`,
    `Notable ${person.occupation} known for their contributions to history`,
    `${person.timeperiod} era ${person.occupation} of great historical significance`,
    `Renowned ${person.occupation} whose legacy spans centuries`
  ];
  
  return hints[Math.floor(Math.random() * hints.length)];
}

async function generateAIHints(name: string, sections: string[]): Promise<[string, string, string]> {
  if (sections.length === 0) {
    const defaultHint = `Historical figure known for significant contributions`;
    return [defaultHint, defaultHint, defaultHint];
  }
  
  try {
    const sectionSummary = sections.slice(0, 8).join(', ');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Generate 3 progressive hints for a guessing game. Each should be more specific than the last. Keep each hint under 50 words. Make them guessable but not obvious."
        },
        {
          role: "user",
          content: `Create 3 hints for ${name}. Their Wikipedia sections include: ${sectionSummary}. Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}`
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 300
    });
    
    const result = JSON.parse(response.choices[0].message.content || '{}');
    return [
      result.hint1 || `Historical figure with significant impact`,
      result.hint2 || `Notable person from history`,
      result.hint3 || `Famous individual known for their achievements`
    ];
  } catch (error) {
    const fallbackHint = `Historical figure of great significance`;
    return [fallbackHint, fallbackHint, fallbackHint];
  }
}

async function processOneBatch() {
  // Get batch of unprocessed people
  const unprocessedPeople = await db
    .select()
    .from(famousPeople)
    .where(and(
      eq(famousPeople.filteredOut, 0),
      isNull(famousPeople.processedAt)
    ))
    .orderBy(sql`RANDOM()`)
    .limit(50); // Process 50 at a time
  
  if (unprocessedPeople.length === 0) {
    console.log('🎉 All entries processed!');
    return 0;
  }
  
  console.log(`🔄 Processing batch of ${unprocessedPeople.length} people...`);
  
  let processed = 0;
  
  for (const person of unprocessedPeople) {
    try {
      const wikipediaTitle = person.name.replace(/ /g, '_');
      
      // Fetch Wikipedia data
      const wikipediaData = await fetchWikipediaData(wikipediaTitle);
      
      // Generate hints
      const basicHint = await generateBasicHint(person);
      const [aiHint1, aiHint2, aiHint3] = await generateAIHints(person.name, wikipediaData.sections);
      
      // Generate initials
      const initials = generateInitials(person.name);
      
      // Update database
      await db
        .update(famousPeople)
        .set({
          sections: wikipediaData.sections.length > 0 ? wikipediaData.sections : ['Biography', 'Life', 'Career', 'Legacy'],
          hint: basicHint,
          aiHint1: aiHint1,
          aiHint2: aiHint2,
          aiHint3: aiHint3,
          initials: initials,
          processedAt: new Date()
        })
        .where(eq(famousPeople.id, person.id));
      
      processed++;
      
      if (processed % 10 === 0) {
        console.log(`✅ Processed ${processed}/${unprocessedPeople.length} in current batch`);
      }
      
      // Rate limiting pause
      await new Promise(resolve => setTimeout(resolve, 600));
      
    } catch (error) {
      // Continue with basic data even if Wikipedia/AI fails
      try {
        const basicHint = await generateBasicHint(person);
        const initials = generateInitials(person.name);
        
        await db
          .update(famousPeople)
          .set({
            sections: ['Biography', 'Life', 'Career', 'Legacy'],
            hint: basicHint,
            aiHint1: basicHint,
            aiHint2: basicHint,
            aiHint3: basicHint,
            initials: initials,
            processedAt: new Date()
          })
          .where(eq(famousPeople.id, person.id));
        
        processed++;
      } catch (fallbackError) {
        console.log(`❌ Failed to process ${person.name}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`🏁 Batch complete: ${processed} processed`);
  return processed;
}

async function runContinuousProcessor() {
  console.log('🚀 Starting continuous Wikipedia processor...');
  
  let totalProcessed = 0;
  let batchCount = 0;
  
  while (true) {
    try {
      batchCount++;
      console.log(`\n📊 === BATCH ${batchCount} ===`);
      
      // Get current stats
      const result = await db.execute(`
        SELECT 
          COUNT(*) FILTER (WHERE processed_at IS NOT NULL) as processed,
          COUNT(*) FILTER (WHERE processed_at IS NULL AND filtered_out = 0) as remaining
        FROM famous_people
      `);
      
      const stats = result.rows[0];
      console.log(`📈 Current progress: ${stats.processed} processed, ${stats.remaining} remaining`);
      
      if (parseInt(stats.remaining as string) === 0) {
        console.log('🎉 ALL ENTRIES COMPLETED! Processing finished.');
        break;
      }
      
      const batchProcessed = await processOneBatch();
      totalProcessed += batchProcessed;
      
      if (batchProcessed === 0) {
        console.log('⚠️ No entries processed in this batch, ending...');
        break;
      }
      
      console.log(`📊 Total processed in session: ${totalProcessed}`);
      console.log('⏸️ Brief pause before next batch...');
      
      // Brief pause between batches
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.log('❌ Batch error:', error);
      console.log('⏸️ Waiting 10 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  console.log(`🏆 Session complete! Processed ${totalProcessed} total entries.`);
}

// Start continuous processing
runContinuousProcessor().catch(console.error);