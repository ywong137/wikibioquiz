import { db } from '../server/db';
import { famousPeople } from '../shared/schema';
import { eq, isNotNull } from 'drizzle-orm';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateHighQualityHints(name: string, nationality: string, timeperiod: string, occupation: string): Promise<[string, string, string]> {
  try {
    const prompt = `Generate 3 progressive hints for a Wikipedia guessing game about ${name}.
    
Context: ${nationality} ${occupation} from the ${timeperiod} period

Generate 3 hints that progressively reveal more information:
1. First hint: General biographical context (birthplace, era, field of work)
2. Second hint: More specific achievements or notable works  
3. Third hint: Very specific details that make them identifiable

Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}

Make the hints engaging, informative, and progressively more specific.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system",
          content: "You are an expert at creating engaging, educational biographical hints for a Wikipedia guessing game. Create hints that are accurate, progressive, and help players learn about historical figures."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.7
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return [
      result.hint1 || `${nationality} ${occupation} from the ${timeperiod} period`,
      result.hint2 || `Notable ${occupation} known for significant achievements`,
      result.hint3 || `Famous ${nationality} ${occupation} from history`
    ];
  } catch (error) {
    console.log(`Warning: Could not generate AI hints for ${name}: ${error}`);
    return [
      `${nationality} ${occupation} from the ${timeperiod} period`,
      `Notable ${occupation} known for significant contributions`,
      `Famous ${nationality} ${occupation} from the ${timeperiod} era`
    ];
  }
}

async function batchRestoration() {
  console.log('🔧 BATCH RESTORATION STARTED');
  console.log(`⏰ Start: ${new Date().toLocaleTimeString()}`);
  
  let totalProcessed = 0;
  let batchNumber = 0;
  const startTime = Date.now();
  
  while (true) {
    batchNumber++;
    
    // Process in batches of 20 to manage API rate limits
    const people = await db
      .select()
      .from(famousPeople)
      .where(isNotNull(famousPeople.processedAt))
      .limit(20)
      .offset(totalProcessed);
    
    if (people.length === 0) {
      console.log('🎉 ALL ENTRIES RESTORED!');
      break;
    }
    
    console.log(`🔧 BATCH ${batchNumber}: Restoring ${people.length} entries (${totalProcessed + 1}-${totalProcessed + people.length})...`);
    
    for (const person of people) {
      try {
        // Fix hint format: "nationality - timeperiod - occupation"  
        const properHint = `${person.nationality} - ${person.timeperiod} - ${person.occupation}`;
        
        // Generate high-quality AI hints
        const [aiHint1, aiHint2, aiHint3] = await generateHighQualityHints(
          person.name,
          person.nationality || 'Unknown',
          person.timeperiod || 'Historical',
          person.occupation || 'Historical Figure'
        );
        
        // Update database
        await db
          .update(famousPeople)
          .set({
            hint: properHint,
            aiHint1: aiHint1,
            aiHint2: aiHint2,
            aiHint3: aiHint3,
            processedAt: new Date()
          })
          .where(eq(famousPeople.id, person.id));
        
        totalProcessed++;
        
        // Rate limiting to avoid overwhelming OpenAI API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`❌ Error restoring ${person.name}: ${error}`);
        totalProcessed++; // Still count as processed to avoid infinite loop
      }
    }
    
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = totalProcessed / elapsed * 60;
    
    console.log(`✅ BATCH ${batchNumber} COMPLETE: ${people.length} entries processed`);
    console.log(`📊 TOTAL: ${totalProcessed} restored in ${elapsed.toFixed(0)}s (${rate.toFixed(1)} per minute)`);
    
    // Small pause between batches
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`🏆 BATCH RESTORATION COMPLETE!`);
  console.log(`📈 Total restored: ${totalProcessed}`);
  console.log(`⏰ Total time: ${totalTime.toFixed(1)} seconds`);
  
  // Final verification
  const sampleCheck = await db
    .select({ name: famousPeople.name, hint: famousPeople.hint, aiHint1: famousPeople.aiHint1 })
    .from(famousPeople)
    .where(isNotNull(famousPeople.processedAt))
    .limit(5);
  
  console.log('\n📋 SAMPLE VERIFICATION:');
  sampleCheck.forEach(person => {
    console.log(`✅ ${person.name}`);
    console.log(`   Hint: ${person.hint}`);
    console.log(`   AI Hint: ${person.aiHint1}`);
  });
  
  console.log(`⏰ End: ${new Date().toLocaleTimeString()}`);
}

batchRestoration().catch(console.error);