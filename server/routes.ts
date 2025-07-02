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
      const session = await storage.createGameSession({
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

      const person = await getRandomWikipediaPerson(session.usedPeople);
      
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
      const person = await getRandomWikipediaPerson(session.usedPeople);
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
      const { guess, sessionId } = guessSchema.parse(req.body);
      const personName = req.body.personName as string;
      
      const session = await storage.getGameSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const isCorrect = isCorrectGuess(guess, personName);
      let pointsEarned = 0;
      let newStreak = session.streak;
      let newScore = session.score;

      if (isCorrect) {
        pointsEarned = 10 + (session.streak * 2); // Bonus points for streak
        newStreak = session.streak + 1;
        newScore = session.score + pointsEarned;
      } else {
        newStreak = 0;
      }

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
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
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

async function getRandomWikipediaPerson(usedPeople: string[]): Promise<WikipediaPerson> {
  // Try multiple times to find a good person not already used
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const person = await tryGetRandomPerson();
      
      // Skip if already used
      if (usedPeople.includes(person.name)) {
        continue;
      }
      
      // Skip if sections are too few or poor quality
      if (person.sections.length < 3) {
        continue;
      }
      
      return person;
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      continue;
    }
  }
  
  // If all attempts failed, try from category
  return await getPersonFromCategory(usedPeople);
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
    "Nobel_Prize_winners",
    "American_film_directors",
    "British_actors",
    "French_artists",
    "German_scientists",
    "Italian_Renaissance_artists",
    "American_presidents",
    "British_prime_ministers",
    "Olympic_athletes",
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
    "19th-century_people",
    "20th-century_people", 
    "21st-century_people",
    "Renaissance_people",
    "Medieval_people"
  ];
  
  const period = periods[Math.floor(Math.random() * periods.length)];
  return await getPersonFromWikipediaCategory(period);
}

async function getFromNationalityCategory(): Promise<WikipediaPerson> {
  const nationalities = [
    "American_people",
    "British_people",
    "French_people", 
    "German_people",
    "Italian_people",
    "Spanish_people",
    "Japanese_people",
    "Canadian_people"
  ];
  
  const nationality = nationalities[Math.floor(Math.random() * nationalities.length)];
  return await getPersonFromWikipediaCategory(nationality);
}

async function getPersonFromWikipediaCategory(categoryName: string): Promise<WikipediaPerson> {
  try {
    console.log(`Trying to fetch from category: ${categoryName}`);
    
    // Get random articles from category using the correct API endpoint
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${categoryName}&cmlimit=100&format=json&origin=*&cmnamespace=0`
    );
    
    if (!response.ok) {
      console.log(`Category fetch failed for ${categoryName}`);
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
        const summaryResponse = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(randomMember.title)}`
        );
        
        if (!summaryResponse.ok) continue;
        
        const page = await summaryResponse.json();
        
        // Check if this looks like a person
        if (isProbablyPerson(page.title, page.extract || "")) {
          console.log(`Successfully got person: ${page.title}`);
          return await createPersonFromPage(page);
        }
      } catch (error) {
        console.log(`Failed to process member, trying next...`);
        continue;
      }
    }
    
    throw new Error("No suitable person found in category");
    
  } catch (error) {
    console.log(`Category strategy failed: ${error.message}`);
    // Try a completely different approach
    return await getRandomPersonDirect();
  }
}

async function createPersonFromPage(page: any): Promise<WikipediaPerson> {
  // Get sections
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
        !title.toLowerCase().includes('see also') &&
        !title.toLowerCase().includes('bibliography')
      )
      .slice(0, 8);
  }
  
  return {
    name: page.title,
    sections,
    hint: await generateInitialHint(page.extract || ""),
    url: page.content_urls?.desktop?.page || "",
  };
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
      return await getFallbackPerson(usedPeople);
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
      return await getFallbackPerson(usedPeople);
    }
    
    return {
      name: page.title,
      sections,
      hint: generateHint(page.extract),
      url: page.content_urls?.desktop?.page || "",
    };
  } catch (error) {
    return await getFallbackPerson(usedPeople);
  }
}

function isProbablyPerson(title: string, extract: string): boolean {
  const personIndicators = [
    'born', 'birth', 'died', 'death', 'is an', 'is a', 'was an', 'was a',
    'actor', 'actress', 'singer', 'musician', 'writer', 'author', 'scientist',
    'politician', 'athlete', 'director', 'producer', 'artist'
  ];
  
  const text = (title + ' ' + extract).toLowerCase();
  return personIndicators.some(indicator => text.includes(indicator));
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

async function getFallbackPerson(usedPeople: string[]): Promise<WikipediaPerson> {
  // Extensive fallback list of well-known people if Wikipedia API fails
  const fallbackPeople = [
    {
      name: "Albert Einstein",
      sections: ["Early life and education", "Swiss years", "Annus Mirabilis papers", "Nobel Prize", "Theory of relativity", "Later years", "Death", "Legacy"],
      hint: "German-born • Scientist • Theory of relativity",
      url: "https://en.wikipedia.org/wiki/Albert_Einstein"
    },
    {
      name: "Leonardo da Vinci",
      sections: ["Early life", "Professional life", "Paintings", "Inventions", "Anatomy studies", "Later years", "Death", "Legacy"],
      hint: "Italian • Renaissance • Artist and inventor",
      url: "https://en.wikipedia.org/wiki/Leonardo_da_Vinci"
    },
    {
      name: "William Shakespeare",
      sections: ["Early life", "Career", "Plays", "Sonnets", "Later years", "Death", "Legacy", "Authorship question"],
      hint: "English • Playwright • 16th-17th century",
      url: "https://en.wikipedia.org/wiki/William_Shakespeare"
    },
    {
      name: "Marie Curie",
      sections: ["Early life", "Education", "Scientific career", "Nobel Prizes", "Later life", "Death", "Legacy"],
      hint: "Polish-French • Scientist • Nobel Prize winner",
      url: "https://en.wikipedia.org/wiki/Marie_Curie"
    },
    {
      name: "Nelson Mandela",
      sections: ["Early life", "Political activism", "Imprisonment", "Presidency", "Later life", "Death", "Legacy"],
      hint: "South African • Political leader • Anti-apartheid activist",
      url: "https://en.wikipedia.org/wiki/Nelson_Mandela"
    },
    {
      name: "Pablo Picasso",
      sections: ["Early life", "Blue Period", "Rose Period", "Cubism", "Later work", "Personal life", "Death", "Legacy"],
      hint: "Spanish • Artist • Co-founder of Cubism",
      url: "https://en.wikipedia.org/wiki/Pablo_Picasso"
    },
    {
      name: "Winston Churchill",
      sections: ["Early life", "Political career", "World War II", "Post-war career", "Writing", "Death", "Legacy"],
      hint: "British • Prime Minister • World War II leader",
      url: "https://en.wikipedia.org/wiki/Winston_Churchill"
    },
    {
      name: "Michael Jackson",
      sections: ["Early life", "Jackson 5", "Solo career", "Thriller era", "Later career", "Personal life", "Death", "Legacy"],
      hint: "American • Musician • King of Pop",
      url: "https://en.wikipedia.org/wiki/Michael_Jackson"
    },
    {
      name: "Frida Kahlo",
      sections: ["Early life", "Accident and recovery", "Artistic career", "Political views", "Personal life", "Death", "Legacy"],
      hint: "Mexican • Artist • Self-portraits",
      url: "https://en.wikipedia.org/wiki/Frida_Kahlo"
    },
    {
      name: "Martin Luther King Jr.",
      sections: ["Early life", "Education", "Civil rights movement", "Montgomery Bus Boycott", "March on Washington", "Assassination", "Legacy"],
      hint: "American • Civil rights leader • I Have a Dream",
      url: "https://en.wikipedia.org/wiki/Martin_Luther_King_Jr."
    },
    {
      name: "Steve Jobs",
      sections: ["Early life", "Apple I and Apple II", "Departure from Apple", "Return to Apple", "iPhone and iPad", "Personal life", "Death", "Legacy"],
      hint: "American • Technology entrepreneur • Co-founder of Apple",
      url: "https://en.wikipedia.org/wiki/Steve_Jobs"
    },
    {
      name: "Oprah Winfrey",
      sections: ["Early life", "Career beginnings", "The Oprah Winfrey Show", "Media empire", "Philanthropy", "Personal life", "Awards and honors"],
      hint: "American • Media mogul • Talk show host",
      url: "https://en.wikipedia.org/wiki/Oprah_Winfrey"
    },
    {
      name: "Muhammad Ali",
      sections: ["Early life", "Amateur career", "Professional boxing", "Vietnam War", "Later career", "Retirement", "Death", "Legacy"],
      hint: "American • Boxer • The Greatest",
      url: "https://en.wikipedia.org/wiki/Muhammad_Ali"
    },
    {
      name: "Jane Austen",
      sections: ["Early life", "Juvenilia", "First publications", "Later novels", "Death", "Posthumous publication", "Legacy"],
      hint: "English • Novelist • Pride and Prejudice",
      url: "https://en.wikipedia.org/wiki/Jane_Austen"
    },
    {
      name: "Charles Darwin",
      sections: ["Early life", "Voyage of the Beagle", "Theory of evolution", "Origin of Species", "Later life", "Death", "Legacy"],
      hint: "British • Naturalist • Theory of evolution",
      url: "https://en.wikipedia.org/wiki/Charles_Darwin"
    }
  ];
  
  const available = fallbackPeople.filter(person => !usedPeople.includes(person.name));
  if (available.length === 0) {
    // Reset and return a random person
    return fallbackPeople[Math.floor(Math.random() * fallbackPeople.length)];
  }
  
  return available[Math.floor(Math.random() * available.length)];
}
