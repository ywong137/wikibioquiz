import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertGameSessionSchema, type WikipediaPerson } from "@shared/schema";
import { z } from "zod";

const guessSchema = z.object({
  guess: z.string().min(1),
  sessionId: z.number(),
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
  try {
    // Get Wikipedia summary for additional hint information
    const response = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(personName)}`
    );
    
    if (!response.ok) {
      return "This person has made significant contributions to their field and has an extensive Wikipedia page.";
    }
    
    const data = await response.json();
    const extract = data.extract || "";
    
    // Extract more specific hints from the Wikipedia extract
    const hints = [];
    
    // Look for birth/death years
    const yearMatch = extract.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      if (year < 1800) hints.push("Lived before the 19th century");
      else if (year < 1900) hints.push("Lived in the 19th century");
      else if (year < 1950) hints.push("Born in the early 20th century");
      else if (year < 2000) hints.push("Born in the mid-to-late 20th century");
      else hints.push("Born in the 21st century");
    }
    
    // Look for professions/fields
    if (extract.includes('Nobel Prize')) hints.push("Nobel Prize winner");
    if (extract.includes('President') || extract.includes('Prime Minister')) hints.push("Held high political office");
    if (extract.includes('actor') || extract.includes('actress')) hints.push("Known for acting");
    if (extract.includes('director')) hints.push("Film or theater director");
    if (extract.includes('scientist')) hints.push("Made scientific discoveries");
    if (extract.includes('physicist')) hints.push("Worked in physics");
    if (extract.includes('mathematician')) hints.push("Known for mathematics");
    if (extract.includes('painter') || extract.includes('artist')) hints.push("Visual artist");
    if (extract.includes('composer') || extract.includes('musician')) hints.push("Musical composer or performer");
    if (extract.includes('writer') || extract.includes('author') || extract.includes('poet')) hints.push("Literary figure");
    if (extract.includes('inventor')) hints.push("Known for inventions");
    if (extract.includes('philosopher')) hints.push("Philosophical thinker");
    
    // Look for achievements/works
    if (extract.includes('theory of relativity')) hints.push("Associated with revolutionary physics theories");
    if (extract.includes('Mona Lisa') || extract.includes('Last Supper')) hints.push("Created world-famous artworks");
    if (extract.includes('plays') || extract.includes('Romeo') || extract.includes('Hamlet')) hints.push("Wrote famous plays");
    if (extract.includes('civil rights')) hints.push("Civil rights leader");
    if (extract.includes('World War')) hints.push("Played a role in a World War");
    
    // Look for locations
    if (extract.includes('English') || extract.includes('England') || extract.includes('British')) hints.push("From England/Britain");
    if (extract.includes('French') || extract.includes('France')) hints.push("From France");
    if (extract.includes('German') || extract.includes('Germany')) hints.push("From Germany");
    if (extract.includes('Italian') || extract.includes('Italy')) hints.push("From Italy");
    if (extract.includes('American') || extract.includes('United States')) hints.push("From the United States");
    
    if (hints.length === 0) {
      return "This person has made lasting contributions that earned them a detailed Wikipedia page.";
    }
    
    // Return 2-3 hints, avoiding the original hint if possible
    const selectedHints = hints.slice(0, 3);
    return selectedHints.join(" • ");
    
  } catch (error) {
    return "This person is notable enough to have extensive biographical information.";
  }
}

async function getRandomWikipediaPerson(usedPeople: string[]): Promise<WikipediaPerson> {
  try {
    // First, get a random person from a category
    const categoryResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/random/summary`
    );
    
    if (!categoryResponse.ok) {
      throw new Error("Failed to fetch random page");
    }
    
    const randomPage = await categoryResponse.json();
    
    // If it's not about a person, try getting from a people category
    if (!isProbablyPerson(randomPage.title, randomPage.extract)) {
      return await getPersonFromCategory(usedPeople);
    }
    
    // Get the full page content to extract sections
    const pageResponse = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/sections/${encodeURIComponent(randomPage.title)}`
    );
    
    if (!pageResponse.ok) {
      return await getPersonFromCategory(usedPeople);
    }
    
    const sections = await pageResponse.json();
    const sectionTitles = sections
      .filter((section: any) => section.toclevel === 1 && section.line)
      .map((section: any) => section.line)
      .filter((title: string) => 
        !title.toLowerCase().includes('reference') && 
        !title.toLowerCase().includes('external') &&
        !title.toLowerCase().includes('see also')
      )
      .slice(0, 8); // Limit to 8 sections

    if (sectionTitles.length < 3) {
      return await getPersonFromCategory(usedPeople);
    }

    return {
      name: randomPage.title,
      sections: sectionTitles,
      hint: generateHint(randomPage.extract),
      url: randomPage.content_urls?.desktop?.page || "",
    };
  } catch (error) {
    console.error("Error fetching from Wikipedia:", error);
    return await getFallbackPerson(usedPeople);
  }
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
  // Fallback to well-known people if Wikipedia API fails
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
    }
  ];
  
  const available = fallbackPeople.filter(person => !usedPeople.includes(person.name));
  if (available.length === 0) {
    return fallbackPeople[0]; // Reset if we've used all fallbacks
  }
  
  return available[Math.floor(Math.random() * available.length)];
}
