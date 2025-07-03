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

async function testRestoration() {
  console.log('🧪 TESTING RESTORATION ON 5 ENTRIES');
  
  // Get 5 entries to test
  const people = await db
    .select()
    .from(famousPeople)
    .where(isNotNull(famousPeople.processedAt))
    .limit(5);
  
  console.log(`Found ${people.length} entries to test\n`);
  
  for (const person of people) {
    console.log(`🔧 Restoring: ${person.name}`);
    
    // Fix hint format: "nationality - timeperiod - occupation"
    const properHint = `${person.nationality} - ${person.timeperiod} - ${person.occupation}`;
    console.log(`  Old hint: ${person.hint}`);
    console.log(`  New hint: ${properHint}`);
    
    // Generate high-quality AI hints
    const [aiHint1, aiHint2, aiHint3] = await generateHighQualityHints(
      person.name,
      person.nationality || 'Unknown',
      person.timeperiod || 'Historical',
      person.occupation || 'Historical Figure'
    );
    
    console.log(`  AI Hint 1: ${aiHint1}`);
    console.log(`  AI Hint 2: ${aiHint2}`);
    console.log(`  AI Hint 3: ${aiHint3}`);
    
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
    
    console.log(`  ✅ Updated in database\n`);
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('🎉 TEST RESTORATION COMPLETE!');
}

testRestoration().catch(console.error);