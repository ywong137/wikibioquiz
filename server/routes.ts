import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertGameSessionSchema, type WikipediaPerson } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";

const guessSchema = z.object({
  guess: z.string().min(1),
  sessionId: z.number(),
});

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Create new game session
  app.post("/api/game/session", async (req, res) => {
    try {
      const { playerName } = req.body;
      const session = await storage.createGameSession({
        playerName: playerName || null,
        score: 0,
        streak: 0,
        round: 1,
        totalGuesses: 0,
        correctGuesses: 0,
        bestStreak: 0,
        usedPeople: [],
      });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to create game session" });
    }
  });

  // Update player name
  app.patch("/api/game/session/:id/player", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const { playerName } = req.body;
      
      const updatedSession = await storage.updateGameSession(sessionId, {
        playerName: playerName,
      });
      
      if (!updatedSession) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      res.json(updatedSession);
    } catch (error) {
      res.status(500).json({ error: "Failed to update player name" });
    }
  });

  // Get random Wikipedia person
  app.get("/api/game/person", async (req, res) => {
    const sessionId = parseInt(req.query.sessionId as string);
    
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    try {
      const session = await storage.getGameSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const person = await getRandomWikipediaPerson(session.usedPeople, session.round);
      
      // Update session with the new person
      await storage.updateGameSession(sessionId, {
        usedPeople: [...session.usedPeople, person.name],
      });

      res.json(person);
    } catch (error) {
      console.error("Error fetching Wikipedia person:", error);
      res.status(500).json({ error: "Failed to fetch person from Wikipedia" });
    }
  });

  // Pre-load next person for faster transitions
  app.get("/api/game/person/preload", async (req, res) => {
    const sessionId = parseInt(req.query.sessionId as string);
    
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    try {
      const session = await storage.getGameSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Fetch a person but don't update the session yet
      const person = await getRandomWikipediaPerson(session.usedPeople, session.round);
      res.json(person);
    } catch (error) {
      console.error("Error pre-loading Wikipedia person:", error);
      res.status(500).json({ error: "Failed to pre-load person from Wikipedia" });
    }
  });

  // Use preloaded person (update session with it)
  app.post("/api/game/person/use", async (req, res) => {
    try {
      const { sessionId, personName } = req.body;
      
      const session = await storage.getGameSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Update session with the preloaded person
      await storage.updateGameSession(sessionId, {
        usedPeople: [...session.usedPeople, personName],
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error using preloaded person:", error);
      res.status(500).json({ error: "Failed to use preloaded person" });
    }
  });

  // Submit guess
  app.post("/api/game/guess", async (req, res) => {
    try {
      const { guess, sessionId, personName, hintUsed, initialsUsed } = req.body;
      
      const session = await storage.getGameSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const isCorrect = isCorrectGuess(guess, personName);
      let pointsEarned = 0;
      let newStreak = session.streak;
      let newScore = session.score;
      let streakBonus = 0;

      if (isCorrect) {
        // Base points based on hint usage
        if (initialsUsed) {
          pointsEarned = 1; // 1 point for correct with initials
        } else if (hintUsed) {
          pointsEarned = 2; // 2 points for correct with hint
        } else {
          pointsEarned = 7; // 7 points for correct without hint
        }
        
        // Add streak bonus equal to the current streak plus this correct answer
        streakBonus = session.streak + 1;
        pointsEarned += streakBonus;
        
        newStreak = session.streak + 1;
        newScore = session.score + pointsEarned;
      } else {
        newStreak = 0;
      }

      // Record the game round
      await storage.addGameRound({
        sessionId: sessionId,
        personName: personName,
        hintUsed: hintUsed || false,
        initialsUsed: initialsUsed || false,
        correct: isCorrect,
        pointsEarned: pointsEarned,
      });

      const updatedSession = await storage.updateGameSession(sessionId, {
        score: newScore,
        streak: newStreak,
        round: session.round + 1,
        totalGuesses: session.totalGuesses + 1,
        correctGuesses: session.correctGuesses + (isCorrect ? 1 : 0),
        bestStreak: Math.max(session.bestStreak, newStreak),
      });

      res.json({
        correct: isCorrect,
        pointsEarned,
        streakBonus,
        session: updatedSession,
      });
    } catch (error) {
      res.status(400).json({ error: "Invalid request data" });
    }
  });

  // Get hint (deducts points)
  app.post("/api/game/hint", async (req, res) => {
    try {
      const sessionId = parseInt(req.body.sessionId);
      const personName = req.body.personName as string;
      const session = await storage.getGameSession(sessionId);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const newScore = Math.max(0, session.score - 5);
      const updatedSession = await storage.updateGameSession(sessionId, {
        score: newScore,
      });

      // Get additional hint from Wikipedia
      const additionalHint = await getAdditionalHint(personName);

      res.json({
        hint: additionalHint,
        session: updatedSession,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get hint" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

function normalizeGuess(guess: string): string {
  return guess.toLowerCase().trim().replace(/[^\w\s]/g, '');
}

function decodeHtmlEntities(text: string): string {
  // Decode common HTML entities
  const entities: { [key: string]: string } = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
  };
  
  let decoded = text;
  Object.keys(entities).forEach(entity => {
    decoded = decoded.replace(new RegExp(entity, 'g'), entities[entity]);
  });
  
  // Convert HTML italic tags to plain text (for display)
  decoded = decoded.replace(/<\/?i>/g, '');
  
  return decoded;
}

function isCorrectGuess(guess: string, personName: string): boolean {
  const normalizedGuess = normalizeGuess(guess);
  const normalizedName = normalizeGuess(personName);
  
  // Exact match
  if (normalizedGuess === normalizedName) {
    return true;
  }
  
  // Split name into parts
  const nameParts = normalizedName.split(/\s+/);
  const guessParts = normalizedGuess.split(/\s+/);
  
  // Check if guess matches the last name
  if (guessParts.length === 1 && nameParts.length > 1) {
    const lastName = nameParts[nameParts.length - 1];
    if (guessParts[0] === lastName) {
      return true;
    }
  }
  
  // Check if all parts of the guess are in the name
  if (guessParts.every(part => nameParts.includes(part))) {
    return true;
  }
  
  return false;
}

async function getAdditionalHint(personName: string): Promise<string> {
  let extract = "";
  
  try {
    // Get Wikipedia summary for additional hint information
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(personName)}`
    );
    
    if (!response.ok) {
      return "This person has made significant contributions to their field and has an extensive Wikipedia page.";
    }
    
    const data = await response.json();
    extract = data.extract || "";
    
    // Use OpenAI to generate intelligent hints
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using GPT-4o mini for cost efficiency as requested by the user
      messages: [
        {
          role: "system",
          content: `You are helping create hints for a Wikipedia guessing game. Given information about a famous person, generate a helpful hint that gives clues without revealing their identity.

Rules:
- DO NOT mention the person's name directly
- Give 2-3 specific, useful clues separated by " • "
- Include details like time period, profession, nationality, or major achievements
- Make hints challenging but fair - not too obvious, not too obscure
- Focus on what makes this person notable and recognizable

Examples of good hints:
- "20th century physicist • German-born • Revolutionary theories about time and space"
- "Renaissance Italian artist • Created famous paintings in the Louvre • Also an inventor"
- "British playwright • 16th-17th century • Wrote about star-crossed lovers"`
        },
        {
          role: "user", 
          content: `Generate a hint for this person based on their Wikipedia information:\n\n${extract}`
        }
      ],
      max_tokens: 100,
      temperature: 0.3
    });
    
    const hint = completion.choices[0]?.message?.content?.trim();
    return hint || "This person has made significant contributions to their field.";
    
  } catch (error) {
    console.error("OpenAI hint generation failed:", error);
    // Fallback to simple extraction if OpenAI fails
    return generateSimpleHint(extract);
  }
}

function generateSimpleHint(extract: string): string {
  const hints = [];
  
  // Basic fallback hints if OpenAI is unavailable
  if (extract.includes('born')) {
    const yearMatch = extract.match(/born.*?(\d{4})/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      if (year < 1900) hints.push("Born before 1900");
      else if (year < 1950) hints.push("Born in early 20th century");
      else hints.push("Born in mid-to-late 20th century");
    }
  }
  
  if (extract.includes('American')) hints.push("American");
  if (extract.includes('British')) hints.push("British");
  if (extract.includes('scientist')) hints.push("Scientist");
  if (extract.includes('actor') || extract.includes('actress')) hints.push("Actor");
  if (extract.includes('writer') || extract.includes('author')) hints.push("Writer");
  
  if (hints.length === 0) {
    return "This person has made notable contributions to their field.";
  }
  
  return hints.slice(0, 3).join(" • ");
}

async function generateInitialHint(extract: string): Promise<string> {
  try {
    // Use OpenAI for initial hint generation too
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using GPT-4o mini for cost efficiency as requested by the user
      messages: [
        {
          role: "system",
          content: `Generate a brief initial hint for a Wikipedia guessing game. The hint should be displayed when the player first sees the biography sections.

Rules:
- Give 2-3 basic clues separated by " • "
- Include nationality, time period, and general field/profession
- Don't reveal the name or be too specific
- Keep it concise and intriguing

Examples:
- "German-born • 20th century • Physicist"
- "Italian • Renaissance • Artist and inventor"
- "British • 16th century • Playwright"`
        },
        {
          role: "user",
          content: `Generate an initial hint based on this Wikipedia extract:\n\n${extract}`
        }
      ],
      max_tokens: 60,
      temperature: 0.3
    });
    
    const hint = completion.choices[0]?.message?.content?.trim();
    return hint || generateSimpleHint(extract);
    
  } catch (error) {
    console.error("OpenAI initial hint generation failed:", error);
    return generateSimpleHint(extract);
  }
}

async function generateAdditionalHint(extract: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using GPT-4o mini for cost efficiency as requested by the user
      messages: [
        {
          role: "system",
          content: `Generate a detailed hint for a Wikipedia guessing game. This hint will be shown when the player clicks "AI Hint" button.

Rules:
- Give 2-3 specific accomplishments or well-known facts separated by " • "
- Include major achievements, famous works, or significant contributions
- Focus on what they're most famous for
- Don't reveal the name but be more specific than the initial hint

Examples:
- "Developed theory of relativity • Won Nobel Prize in Physics • Famous equation E=mc²"
- "Painted the Mona Lisa • Designed flying machines • Renaissance polymath"
- "Wrote Romeo and Juliet • Created Hamlet • Elizabethan playwright"`
        },
        {
          role: "user",
          content: `Generate a detailed hint based on this person's accomplishments:\n\n${extract}`
        }
      ],
      max_tokens: 100,
      temperature: 0.3
    });
    
    const hint = completion.choices[0]?.message?.content?.trim();
    return hint || "Known for significant contributions to their field";
    
  } catch (error) {
    console.error("OpenAI additional hint generation failed:", error);
    return generateSimpleHint(extract);
  }
}

async function getRandomWikipediaPerson(usedPeople: string[], round: number): Promise<WikipediaPerson> {
  const cachedCount = await storage.getCachedBiographyCount();
  
  // Strategy: Use cache for first 100 rounds if we have 1000+ cached, 
  // then alternate between cache and new fetch
  const shouldUseCache = (cachedCount >= 1000 && round <= 100) || 
                        (cachedCount > 0 && round > 100 && round % 2 === 0);
  
  if (shouldUseCache) {
    console.log(`Using cached biography for round ${round}`);
    const cachedBiographies = await storage.getRandomCachedBiographies(usedPeople, 1);
    
    if (cachedBiographies.length > 0) {
      const cached = cachedBiographies[0];
      return {
        name: cached.name,
        sections: cached.sections,
        hint: cached.hint,
        aiHint: cached.aiHint ?? undefined,
        initials: cached.initials,
        url: cached.wikipediaUrl,
      };
    }
  }
  
  console.log(`Fetching new Wikipedia person for round ${round}`);
  
  // Try multiple times to find a good person not already used
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const person = await tryGetRandomPerson();
      
      // Skip if already used
      if (usedPeople.includes(person.name)) {
        continue;
      }
      
      // Skip if sections are too few 
      if (person.sections.length < 2) {
        continue;
      }
      
      // Cache the person for future use
      try {
        await storage.addCachedBiography({
          wikipediaUrl: person.url,
          name: person.name,
          sections: person.sections,
          hint: person.hint,
          aiHint: person.aiHint,
          initials: person.initials,
          extract: null, // We don't have extract from our current flow
        });
        console.log(`Cached new person: ${person.name}`);
      } catch (cacheError) {
        console.log(`Failed to cache person (likely duplicate): ${person.name}`);
        // Continue anyway, caching failure shouldn't break the game
      }
      
      return person;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      continue;
    }
  }
  
  // If all attempts failed, throw error instead of fallback
  throw new Error("Failed to fetch person from Wikipedia after 5 attempts");
}

async function tryGetRandomPerson(): Promise<WikipediaPerson> {
  // Try different strategies to get diverse people
  const strategies = [
    () => getFromBiographyCategory(),
    () => getFromRandomProfessionCategory(),
    () => getFromTimeperiodCategory(),
    () => getFromNationalityCategory(),
    () => getRandomPersonDirect() // Add direct random as well
  ];
  
  const strategy = strategies[Math.floor(Math.random() * strategies.length)];
  return await strategy();
}

async function getRandomPersonDirect(): Promise<WikipediaPerson> {
  // Direct random person with better filtering
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/random/summary`);
      const page = await response.json();
      
      // Only accept if it looks like a person
      if (isProbablyPerson(page.title, page.extract || "")) {
        return await createPersonFromPage(page);
      }
    } catch (error) {
      continue;
    }
  }
  throw new Error("Could not find suitable random person");
}

async function getFromBiographyCategory(): Promise<WikipediaPerson> {
  const categories = [
    "20th-century_American_actors",
    "20th-century_American_musicians", 
    "American_film_directors",
    "British_actors",
    "German_scientists",
    "American_writers",
    "British_writers",
    "Philosophers",
    "Inventors"
  ];
  
  const category = categories[Math.floor(Math.random() * categories.length)];
  return await getPersonFromWikipediaCategory(category);
}

async function getFromRandomProfessionCategory(): Promise<WikipediaPerson> {
  const professions = ["actors", "musicians", "scientists", "writers", "artists", "directors"];
  const profession = professions[Math.floor(Math.random() * professions.length)];
  
  // Get random page and check if it matches the profession
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/random/summary`);
  const page = await response.json();
  
  if (page.extract && page.extract.toLowerCase().includes(profession.slice(0, -1))) {
    return await createPersonFromPage(page);
  }
  
  // Fallback to category
  return await getPersonFromWikipediaCategory(`American_${profession}`);
}

async function getFromTimeperiodCategory(): Promise<WikipediaPerson> {
  const periods = [
    "Renaissance_people"
  ];
  
  const period = periods[Math.floor(Math.random() * periods.length)];
  return await getPersonFromWikipediaCategory(period);
}

async function getFromNationalityCategory(): Promise<WikipediaPerson> {
  const nationalities = [
    "German_people",
    "Spanish_people"
  ];
  
  const nationality = nationalities[Math.floor(Math.random() * nationalities.length)];
  return await getPersonFromWikipediaCategory(nationality);
}

async function getPersonFromWikipediaCategory(categoryName: string): Promise<WikipediaPerson> {
  try {
    console.log(`Trying to fetch from category: ${categoryName}`);
    
    // Get random articles from category using the correct API endpoint
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${categoryName}&cmlimit=100&format=json&origin=*&cmnamespace=0`;
    console.log(`Fetching URL: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`Category fetch failed for ${categoryName}, status: ${response.status}, statusText: ${response.statusText}`);
      throw new Error("Category fetch failed");
    }
    
    const data = await response.json();
    const members = data.query?.categorymembers || [];
    console.log(`Found ${members.length} members in category ${categoryName}`);
    
    if (members.length === 0) {
      throw new Error("No category members found");
    }
    
    // Try multiple random members in case some fail
    for (let attempt = 0; attempt < Math.min(5, members.length); attempt++) {
      try {
        const randomMember = members[Math.floor(Math.random() * members.length)];
        console.log(`Trying member: ${randomMember.title}`);
        
        // Get page summary
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(randomMember.title)}`;
        console.log(`Fetching summary URL: ${summaryUrl}`);
        
        const summaryResponse = await fetch(summaryUrl);
        
        if (!summaryResponse.ok) {
          console.log(`Summary fetch failed for ${randomMember.title}, status: ${summaryResponse.status}, statusText: ${summaryResponse.statusText}`);
          continue;
        }
        
        const page = await summaryResponse.json();
        
        // Check if this looks like a person
        if (isProbablyPerson(page.title, page.extract || "")) {
          console.log(`Successfully got person: ${page.title}`);
          return await createPersonFromPage(page);
        } else {
          console.log(`Rejected ${page.title} - not detected as person`);
        }
      } catch (error) {
        console.log(`Failed to process member, trying next...`);
        continue;
      }
    }
    
    throw new Error("No suitable person found in category");
    
  } catch (error: any) {
    console.log(`Category strategy failed: ${error?.message || error}`);
    // Try a completely different approach
    return await getRandomPersonDirect();
  }
}

async function createPersonFromPage(page: any): Promise<WikipediaPerson> {
  console.log(`Creating person data for: ${page.title}`);
  
  // Get sections using the main Wikipedia API
  let sections = [];
  try {
    const sectionsUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page.title)}&prop=sections&format=json&origin=*`;
    console.log(`Fetching sections URL: ${sectionsUrl}`);
    
    const sectionsResponse = await fetch(sectionsUrl);
    
    if (sectionsResponse.ok) {
      const sectionsData = await sectionsResponse.json();
      if (sectionsData.parse && sectionsData.parse.sections) {
        console.log(`Sections response OK for ${page.title}`);
        sections = sectionsData.parse.sections
          .filter((section: any) => section.toclevel === 1 && section.line)
          .map((section: any) => decodeHtmlEntities(section.line))
          .filter((title: string) => 
            !title.toLowerCase().includes('reference') && 
            !title.toLowerCase().includes('external') &&
            !title.toLowerCase().includes('see also') &&
            !title.toLowerCase().includes('bibliography')
          )
          .slice(0, 8);
        console.log(`Found ${sections.length} sections for ${page.title}: ${sections.join(', ')}`);
      } else {
        console.log(`No sections data found for ${page.title}`);
      }
    } else {
      console.log(`Sections response failed for ${page.title}, status: ${sectionsResponse.status}`);
    }
  } catch (error) {
    console.log(`Sections fetch failed for ${page.title}: ${error}`);
  }
  
  // Generate both types of hints
  console.log(`About to generate hints for ${page.title}`);
  let hint: string;
  let aiHint: string;
  
  try {
    // Generate initial hint (for top clue)
    hint = await generateInitialHint(page.extract || "");
    console.log(`Generated initial hint successfully for ${page.title}`);
    
    // Generate additional AI hint (for AI hint button)
    aiHint = await generateAdditionalHint(page.extract || "");
    console.log(`Generated AI hint successfully for ${page.title}`);
  } catch (error) {
    console.log(`OpenAI hint generation failed for ${page.title}, using fallback`);
    hint = generateSimpleHint(page.extract || "");
    aiHint = generateSimpleHint(page.extract || "");
  }
  
  const result = {
    name: page.title,
    sections,
    hint,
    aiHint,
    initials: generateInitials(page.title),
    url: page.content_urls?.desktop?.page || "",
  };
  
  console.log(`Returning person data for ${page.title} with ${sections.length} sections`);
  return result;
}

async function getPersonFromCategory(usedPeople: string[]): Promise<WikipediaPerson> {
  try {
    // Try to get people from various biographical categories
    const categories = [
      "American_actors",
      "American_musicians", 
      "Scientists",
      "Politicians",
      "Writers",
      "Athletes"
    ];
    
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/random/summary`
    );
    
    if (!response.ok) {
      throw new Error("Failed to fetch random Wikipedia page");
    }
    
    const page = await response.json();
    
    // Get sections for this person
    const sectionsResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/sections/${encodeURIComponent(page.title)}`
    );
    
    let sections = [];
    if (sectionsResponse.ok) {
      const sectionsData = await sectionsResponse.json();
      sections = sectionsData
        .filter((section: any) => section.toclevel === 1 && section.line)
        .map((section: any) => section.line)
        .filter((title: string) => 
          !title.toLowerCase().includes('reference') && 
          !title.toLowerCase().includes('external') &&
          !title.toLowerCase().includes('see also')
        )
        .slice(0, 8);
    }
    
    if (sections.length < 3) {
      throw new Error("Person has insufficient sections for game");
    }
    
    return {
      name: page.title,
      sections,
      hint: generateHint(page.extract),
      initials: generateInitials(page.title),
      url: page.content_urls?.desktop?.page || "",
    };
  } catch (error) {
    throw new Error("Failed to get person from category");
  }
}

function isProbablyPerson(title: string, extract: string): boolean {
  // Skip obvious non-person pages
  const excludeTerms = [
    'list of', 'category:', 'disambiguation', 'redirect', 'template:', 
    'people', 'americans', 'british', 'german', 'spanish', 'french',
    'italians', 'canadians', 'japanese'
  ];
  
  const titleLower = title.toLowerCase();
  if (excludeTerms.some(term => titleLower.includes(term))) {
    return false;
  }
  
  // If it has any biographical indicators, it's probably a person
  const personIndicators = [
    'born', 'birth', 'died', 'death', 'is an', 'is a', 'was an', 'was a',
    'actor', 'actress', 'singer', 'musician', 'writer', 'author', 'scientist',
    'politician', 'athlete', 'director', 'producer', 'artist', 'composer',
    'painter', 'philosopher', 'inventor', 'businessman'
  ];
  
  const text = (title + ' ' + extract).toLowerCase();
  return personIndicators.some(indicator => text.includes(indicator));
}

function generateInitials(fullName: string): string {
  return fullName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('.');
}

function generateHint(extract: string): string {
  const hints = [];
  
  if (extract.includes('born')) {
    const birthMatch = extract.match(/born.*?(\d{4})/);
    if (birthMatch) {
      const year = parseInt(birthMatch[1]);
      if (year >= 1900) hints.push("Born in the 20th century or later");
      else hints.push("Born before 1900");
    }
  }
  
  if (extract.includes('American')) hints.push("American");
  if (extract.includes('British')) hints.push("British");
  if (extract.includes('actor') || extract.includes('actress')) hints.push("Actor/Actress");
  if (extract.includes('singer') || extract.includes('musician')) hints.push("Musician");
  if (extract.includes('writer') || extract.includes('author')) hints.push("Writer");
  if (extract.includes('scientist')) hints.push("Scientist");
  if (extract.includes('politician')) hints.push("Politician");
  
  if (hints.length === 0) {
    hints.push("Famous person");
  }
  
  return hints.slice(0, 3).join(" • ");
}


