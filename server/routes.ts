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

// Global lock to prevent concurrent Wikipedia fetches
let wikipediaFetchLock: Promise<WikipediaPerson> | null = null;
let lockRequestId: string | null = null;

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

  // Increment round (called when "Next Person" is clicked)
  app.post("/api/game/session/:id/next-round", async (req, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      
      const session = await storage.getGameSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const updatedSession = await storage.updateGameSession(sessionId, {
        round: session.round + 1,
      });

      res.json(updatedSession);
    } catch (error) {
      console.error("Error incrementing round:", error);
      res.status(500).json({ error: "Failed to increment round" });
    }
  });

  // Get random Wikipedia person
  app.get("/api/game/person", async (req, res) => {
    const sessionId = parseInt(req.query.sessionId as string);
    const requestId = Math.random().toString(36).substring(7);
    console.log(`\n🚀 REQUEST START [${requestId}]: GET /api/game/person?sessionId=${sessionId}`);
    
    if (!sessionId) {
      console.log(`❌ REQUEST END [${requestId}]: Missing sessionId`);
      return res.status(400).json({ error: "Session ID is required" });
    }

    try {
      const session = await storage.getGameSession(sessionId);
      if (!session) {
        console.log(`❌ REQUEST END [${requestId}]: Session not found`);
        return res.status(404).json({ error: "Session not found" });
      }

      console.log(`🎯 REQUEST [${requestId}]: Calling getRandomWikipediaPerson for round ${session.round}`);
      
      // Check if there's already a Wikipedia fetch in progress
      if (wikipediaFetchLock) {
        console.log(`🔒 REQUEST [${requestId}]: Waiting for existing Wikipedia fetch (${lockRequestId}) to complete...`);
        const person = await wikipediaFetchLock;
        console.log(`🔓 REQUEST [${requestId}]: Reusing person from existing fetch: ${person.name}`);
        
        // Update session with the new person (round NEVER increments here)
        await storage.updateGameSession(sessionId, {
          usedPeople: [...session.usedPeople, person.name],
        });

        console.log(`✅ REQUEST END [${requestId}]: Returning person ${person.name}`);
        return res.json(person);
      }
      
      // Start new curated person fetch with lock
      lockRequestId = requestId;
      wikipediaFetchLock = getFamousPersonFromDatabase(session.usedPeople, session.round);
      
      try {
        const person = await wikipediaFetchLock;
        console.log(`🔓 REQUEST [${requestId}]: Famous person fetch completed: ${person.name}`);
        
        // Update session with the new person (round NEVER increments here)
        await storage.updateGameSession(sessionId, {
          usedPeople: [...session.usedPeople, person.name],
        });

        console.log(`✅ REQUEST END [${requestId}]: Returning person ${person.name}`);
        res.json(person);
      } finally {
        // Clear the lock when done
        wikipediaFetchLock = null;
        lockRequestId = null;
      }
    } catch (error) {
      console.error(`❌ REQUEST END [${requestId}]: Error -`, error);
      res.status(500).json({ error: "Failed to fetch person from Wikipedia" });
    }
  });

  // Pre-load next person for faster transitions (TEMPORARILY DISABLED to reduce redundant fetching)
  app.get("/api/game/person/preload", async (req, res) => {
    console.log("🚫 PRELOAD: Temporarily disabled to prevent redundant fetching");
    res.json({ disabled: true, message: "Preload temporarily disabled" });
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
      const { guess, sessionId, personName, hintUsed, initialsUsed, hintsUsedCount } = req.body;
      
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
        // Progressive scoring: Start with 7 points, lose 1 per hint, lose 2 for initials
        pointsEarned = 7;
        if (hintsUsedCount) {
          pointsEarned -= hintsUsedCount; // Lose 1 point per hint used
        }
        if (initialsUsed) {
          pointsEarned -= 2; // Lose 2 points for initials
        }
        // Ensure minimum of 1 point
        pointsEarned = Math.max(1, pointsEarned);
        
        // Add streak bonus only at multiples of 5
        const newStreakValue = session.streak + 1;
        if (newStreakValue % 5 === 0) {
          streakBonus = newStreakValue;
          pointsEarned += streakBonus;
        }
        
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
        // Round should NOT increment on guess - only when new person is loaded
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
  return normalizeAccentedText(guess.toLowerCase().trim());
}

function normalizeAccentedText(text: string): string {
  // Replace accented characters with their base equivalents for generous matching
  const accentMap: Record<string, string> = {
    // Basic Latin accents
    'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae', 'ā': 'a', 'ă': 'a', 'ą': 'a',
    'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e', 'ė': 'e', 'ę': 'e', 'ě': 'e',
    'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ī': 'i', 'į': 'i',
    'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o', 'ō': 'o', 'ő': 'o', 'œ': 'oe',
    'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ū': 'u', 'ů': 'u', 'ű': 'u', 'ų': 'u',
    'ñ': 'n', 'ň': 'n', 'ń': 'n', 'ņ': 'n',
    'ç': 'c', 'č': 'c', 'ć': 'c', 'ċ': 'c', 'ĉ': 'c',
    'ý': 'y', 'ÿ': 'y', 'ŷ': 'y',
    'ð': 'd', 'þ': 'th', 'đ': 'd',
    // Additional European characters
    'ß': 'ss', 'ř': 'r', 'ŕ': 'r', 'ŗ': 'r',
    'ś': 's', 'š': 's', 'ş': 's', 'ș': 's', 'ŝ': 's',
    'ť': 't', 'ţ': 't', 'ț': 't', 'ŧ': 't',
    'ź': 'z', 'ż': 'z', 'ž': 'z',
    'ĝ': 'g', 'ğ': 'g', 'ġ': 'g', 'ģ': 'g',
    'ĥ': 'h', 'ħ': 'h',
    'ĵ': 'j',
    'ķ': 'k', 'ĸ': 'k',
    'ĺ': 'l', 'ļ': 'l', 'ľ': 'l', 'ŀ': 'l', 'ł': 'l',
    'ŵ': 'w'
  };
  
  let normalized = text;
  for (const [accented, base] of Object.entries(accentMap)) {
    normalized = normalized.replace(new RegExp(accented, 'g'), base);
  }
  
  // Remove any remaining non-alphanumeric characters except spaces
  normalized = normalized.replace(/[^\w\s]/g, '');
  
  // Handle abbreviations: remove periods and condense spaces for better matching
  // "A. J. Cronin" becomes "AJ Cronin"
  normalized = normalized.replace(/\b([a-z])\.\s*/g, '$1');
  
  return normalized;
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

function removeMiddleInitials(nameParts: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < nameParts.length; i++) {
    const part = nameParts[i];
    // Check if it's a middle initial (single letter with optional period)
    const isMiddleInitial = (part.length === 1 || (part.length === 2 && part.endsWith('.')));
    
    if (isMiddleInitial) {
      // Keep if it's the first or last part (could be first name or last name)
      if (i === 0 || i === nameParts.length - 1) {
        result.push(part);
      }
      // Skip middle initials (positions 1 to length-2)
    } else {
      result.push(part);
    }
  }
  return result;
}

function removeOfSuffix(nameParts: string[]): string[] {
  // Find the "of" pattern and remove "of [Location]" suffix
  for (let i = 0; i < nameParts.length - 1; i++) {
    if (nameParts[i].toLowerCase() === 'of') {
      // Return everything before "of"
      return nameParts.slice(0, i);
    }
  }
  // No "of" pattern found, return original
  return nameParts;
}

function isOfNameMatch(guess: string, fullName: string): boolean {
  // For "of" names, use very restrictive matching
  // Only accept: "everything before the of" and "the whole thing"
  
  // Check for exact match (already handled in caller, but include for completeness)
  if (guess === fullName) {
    return true;
  }
  
  // Handle comma + "of" pattern: "Diana, Princess of Wales"
  if (fullName.includes(', ') && fullName.includes(' of ')) {
    const commaIndex = fullName.indexOf(', ');
    const ofIndex = fullName.indexOf(' of ');
    
    if (commaIndex < ofIndex) {
      // Pattern: "FirstName, Title of Location"
      const firstName = fullName.substring(0, commaIndex).trim();
      const titlePart = fullName.substring(commaIndex + 2, ofIndex).trim();
      
      // Valid formats:
      // 1. "Diana" (first name only)
      // 2. "Princess Diana" (title + first name)
      // 3. "Diana, Princess of Wales" (full name - already checked above)
      
      if (guess === firstName) {
        return true; // "Diana"
      }
      
      if (guess === `${titlePart} ${firstName}`) {
        return true; // "Princess Diana"
      }
      
      return false; // Block everything else
    }
  }
  
  // Standard "of" pattern: "Ivan V of Russia", "Catherine of Aragon"
  const ofIndex = fullName.indexOf(' of ');
  if (ofIndex > 0) {
    const beforeOf = fullName.substring(0, ofIndex).trim();
    
    // Only accept "everything before the of"
    if (guess === beforeOf) {
      return true;
    }
  }
  
  // Block all other matches for "of" names
  return false;
}

function isTheTitleMatch(guess: string, fullName: string): boolean {
  // For "the [Title]" names, use restrictive matching
  // Only accept: "first name" and "the whole thing"
  
  // Check for exact match (already handled in caller, but include for completeness)
  if (guess === fullName) {
    return true;
  }
  
  // Standard "the [Title]" pattern: "Alfonso the Battler", "William the Conqueror"
  const theIndex = fullName.indexOf(' the ');
  if (theIndex > 0) {
    const beforeThe = fullName.substring(0, theIndex).trim();
    
    // Only accept "everything before the"
    if (guess === beforeThe) {
      return true;
    }
  }
  
  // Block all other matches for "the [Title]" names
  return false;
}

function isCorrectGuess(guess: string, personName: string): boolean {
  const normalizedGuess = normalizeGuess(guess);
  const normalizedName = normalizeGuess(personName);
  
  // Exact match
  if (normalizedGuess === normalizedName) {
    return true;
  }
  
  // Special handling for "of" names - use restrictive matching
  if (normalizedName.includes(' of ')) {
    return isOfNameMatch(normalizedGuess, normalizedName);
  }
  
  // Special handling for "the [Title]" names - use restrictive matching
  if (normalizedName.includes(' the ')) {
    return isTheTitleMatch(normalizedGuess, normalizedName);
  }
  
  // Split name into parts for regular names
  const nameParts = normalizedName.split(/\s+/);
  const guessParts = normalizedGuess.split(/\s+/);
  
  // Check if guess matches name with middle initials removed
  const guessWithoutMiddleInitials = removeMiddleInitials(guessParts);
  const nameWithoutMiddleInitials = removeMiddleInitials(nameParts);
  
  if (guessWithoutMiddleInitials.join(' ') === nameWithoutMiddleInitials.join(' ')) {
    return true;
  }
  
  // If only one part, check if it's a valid surname match
  if (guessParts.length === 1) {
    return isSurnameMatch(guessParts[0], nameParts);
  }
  
  // For multi-part guesses, check if it contains valid surname combinations
  return isValidSurnameCombo(guessParts, nameParts);
}

function isSurnameMatch(guess: string, nameParts: string[]): boolean {
  const connectors = new Set(['van', 'von', 'de', 'del', 'della', 'di', 'da', 'du', 'le', 'la', 'el', 'al', 'ibn', 'bin', 'of', 'mac', 'mc', 'o', 'fitz']);
  
  // STEP 1: Reject standalone connectors
  if (connectors.has(guess)) {
    return false;
  }
  
  if (nameParts.length === 1) {
    return guess === nameParts[0];
  }
  
  // STEP 2: Check if matches final surname
  const lastName = nameParts[nameParts.length - 1];
  if (guess === lastName) {
    return true;
  }
  
  // STEP 3: Check compound surname patterns
  for (let i = 1; i < nameParts.length; i++) {
    const part = nameParts[i];
    if (connectors.has(part.toLowerCase()) && i < nameParts.length - 1) {
      const nextPart = nameParts[i + 1];
      if (guess === nextPart) {
        return true;
      }
    }
  }
  
  // STEP 4: Reject first names
  const firstNameEnd = findFirstNameEnd(nameParts);
  for (let i = 0; i < firstNameEnd; i++) {
    if (guess === nameParts[i]) {
      return false;
    }
  }
  
  return false;
}

function findFirstNameEnd(nameParts: string[]): number {
  const connectors = new Set(['van', 'von', 'de', 'del', 'della', 'di', 'da', 'du', 'le', 'la', 'el', 'al', 'ibn', 'bin', 'of', 'mac', 'mc', 'o', 'fitz']);
  
  // Find the first connector, everything before it is likely first name(s)
  for (let i = 0; i < nameParts.length; i++) {
    if (connectors.has(nameParts[i].toLowerCase())) {
      return i;
    }
  }
  
  // If no connector found, assume first 1-2 words are first names
  if (nameParts.length >= 3) {
    return 2; // First two words are likely first names
  } else if (nameParts.length === 2) {
    return 1; // First word is likely first name
  }
  
  return 0; // Single name
}

function isValidSurnameCombo(guessParts: string[], nameParts: string[]): boolean {
  const connectors = new Set(['van', 'von', 'de', 'del', 'della', 'di', 'da', 'du', 'le', 'la', 'el', 'al', 'ibn', 'bin', 'of', 'mac', 'mc', 'o', 'fitz']);
  
  // STEP 1: Check if forms contiguous sequence
  const contiguousMatch = findContiguousMatch(guessParts, nameParts);
  if (!contiguousMatch) {
    return false;
  }
  
  // STEP 2: Semantic validation
  const firstNameEnd = findFirstNameEnd(nameParts);
  const matchStart = contiguousMatch.startIndex;
  const matchEnd = contiguousMatch.startIndex + guessParts.length - 1;
  
  // Reject if entirely in first name section
  if (matchEnd < firstNameEnd) {
    return false;
  }
  
  // Reject "first name + connector" patterns (only when ending exactly at connector)
  if (matchStart < firstNameEnd && matchEnd === firstNameEnd && nameParts[matchEnd] && connectors.has(nameParts[matchEnd].toLowerCase())) {
    return false;
  }
  
  // Accept if extends into or past surname section
  return matchEnd >= firstNameEnd;
}

function findContiguousMatch(guessParts: string[], nameParts: string[]): { startIndex: number } | null {
  for (let i = 0; i <= nameParts.length - guessParts.length; i++) {
    let matches = true;
    for (let j = 0; j < guessParts.length; j++) {
      if (guessParts[j] !== nameParts[i + j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { startIndex: i };
    }
  }
  return null;
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

// New curated approach: Select from famous people database, then fetch from Wikipedia
async function getFamousPersonFromDatabase(usedPeople: string[], round: number): Promise<WikipediaPerson> {
  console.log(`\n🎯 ROUND ${round}: Selecting from famous people database with runtime population...`);
  
  try {
    // Get random famous person from database (not filtered out)
    const famousPerson = await storage.getRandomFamousPerson(usedPeople);
    
    if (!famousPerson) {
      throw new Error("No famous people available in database");
    }
    
    console.log(`📍 SELECTED: ${famousPerson.name} (${famousPerson.category}, ${famousPerson.timeperiod})`);
    
    // Check if we need to populate data (missing or error states)
    const needsPopulation = !famousPerson.sections || 
                           !famousPerson.aiHint1 || 
                           famousPerson.sections?.includes('WIKI_ERROR') ||
                           famousPerson.aiHint1 === 'AI_ERROR';
    
    if (needsPopulation) {
      console.log(`🔄 POPULATING: ${famousPerson.name} needs Wikipedia/AI data...`);
      
      // Try to populate the person's data
      const populatedPerson = await populatePersonData(famousPerson);
      
      // Return the populated person
      return createWikipediaPersonFromDb(populatedPerson);
    }
    
    // Use existing data
    console.log(`✅ CACHED: Using existing data for ${famousPerson.name}`);
    return createWikipediaPersonFromDb(famousPerson);
    
  } catch (error) {
    console.error(`❌ DATABASE: Error fetching famous person: ${error}`);
    throw new Error(`Failed to fetch famous person: ${error.message}`);
  }
}

async function populatePersonData(famousPerson: any): Promise<any> {
  console.log(`📥 POPULATING: Starting data population for ${famousPerson.name}`);
  
  let sections: string[] = [];
  let biography = '';
  let aiHint1 = '';
  let aiHint2 = '';
  let aiHint3 = '';
  // Use existing initials from database (already pre-calculated correctly)
  const initials = famousPerson.initials;
  
  // Try to fetch Wikipedia data
  try {
    const wikipediaTitle = famousPerson.wikipediaTitle || famousPerson.name.replace(/ /g, '_');
    console.log(`📖 WIKI: Fetching sections for ${wikipediaTitle}`);
    
    const wikipediaData = await fetchWikipediaData(wikipediaTitle);
    sections = wikipediaData.sections;
    biography = wikipediaData.biography;
    
    console.log(`📖 WIKI: Successfully fetched ${sections.length} sections`);
  } catch (error) {
    console.error(`❌ WIKI: Failed to fetch Wikipedia data: ${error}`);
    sections = ['WIKI_ERROR'];
    biography = 'WIKI_ERROR';
  }
  
  // Try to generate AI hints if Wikipedia succeeded
  if (sections[0] !== 'WIKI_ERROR') {
    try {
      console.log(`🤖 AI: Generating hints for ${famousPerson.name}`);
      const aiHints = await generateAIHints(famousPerson.name, famousPerson.nationality, famousPerson.timeperiod, famousPerson.occupation, biography);
      aiHint1 = aiHints[0];
      aiHint2 = aiHints[1];
      aiHint3 = aiHints[2];
      
      console.log(`🤖 AI: Successfully generated 3 hints`);
    } catch (error) {
      console.error(`❌ AI: Failed to generate AI hints: ${error}`);
      aiHint1 = 'AI_ERROR';
      aiHint2 = 'AI_ERROR';
      aiHint3 = 'AI_ERROR';
    }
  } else {
    aiHint1 = 'AI_ERROR';
    aiHint2 = 'AI_ERROR';
    aiHint3 = 'AI_ERROR';
  }
  
  // Update database with the populated data
  const updatedPerson = await storage.updateFamousPerson(famousPerson.id, {
    sections,
    aiHint1,
    aiHint2,
    aiHint3,
    initials,
    biography,
    processedAt: new Date()
  });
  
  console.log(`✅ POPULATED: Successfully updated ${famousPerson.name} in database`);
  return updatedPerson;
}

function createWikipediaPersonFromDb(famousPerson: any): WikipediaPerson {
  return {
    name: famousPerson.name, // Keep the original human-readable name
    sections: famousPerson.sections || [],
    hint: famousPerson.hint || `"${famousPerson.nationality || famousPerson.category} • ${famousPerson.timeperiod} • ${famousPerson.occupation}"`,
    aiHint1: famousPerson.aiHint1 && famousPerson.aiHint1 !== 'AI_ERROR' ? famousPerson.aiHint1 : undefined,
    aiHint2: famousPerson.aiHint2 && famousPerson.aiHint2 !== 'AI_ERROR' ? famousPerson.aiHint2 : undefined,
    aiHint3: famousPerson.aiHint3 && famousPerson.aiHint3 !== 'AI_ERROR' ? famousPerson.aiHint3 : undefined,
    initials: famousPerson.initials, // Use pre-calculated initials from database
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(famousPerson.wikipediaTitle || famousPerson.name.replace(/ /g, '_'))}`,
  };
}

async function createPersonFromWikipediaTitle(title: string): Promise<WikipediaPerson> {
  console.log(`📖 WIKI: Fetching data for "${title}"`);
  
  // Fetch Wikipedia summary
  const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  console.log(`Fetching summary URL: ${summaryUrl}`);
  
  const summaryResponse = await fetch(summaryUrl);
  if (!summaryResponse.ok) {
    throw new Error(`Wikipedia summary fetch failed: ${summaryResponse.status}`);
  }
  
  const summaryData = await summaryResponse.json();
  const extract = summaryData.extract || "";
  
  if (!extract) {
    throw new Error(`No extract available for ${title}`);
  }
  
  // Get sections
  const sectionsUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=sections&format=json&origin=*`;
  console.log(`Fetching sections URL: ${sectionsUrl}`);
  
  const sectionsResponse = await fetch(sectionsUrl);
  if (!sectionsResponse.ok) {
    throw new Error(`Wikipedia sections fetch failed: ${sectionsResponse.status}`);
  }
  
  const sectionsData = await sectionsResponse.json();
  const sections = sectionsData.parse?.sections?.map((s: any) => s.line) || [];
  
  console.log(`Found ${sections.length} sections for ${title}: ${sections.join(', ')}`);
  
  // Check if person has enough sections BEFORE generating expensive hints
  if (sections.length < 6) {
    console.log(`⚠️ SECTIONS: "${title}" has only ${sections.length} sections (minimum 6 required), skipping hint generation`);
    throw new Error(`Insufficient sections: ${title} has only ${sections.length} sections (minimum 6 required)`);
  }
  
  // Generate hints only after confirming sufficient sections
  const hint = await generateInitialHint(extract);
  const aiHint = await generateAdditionalHint(extract);
  const initials = generateInitials(title);
  
  return {
    name: title,
    sections: sections,
    hint: hint,
    aiHint1: aiHint,
    aiHint2: undefined,
    aiHint3: undefined,
    initials: initials,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
  };
}

async function getRandomWikipediaPerson(usedPeople: string[], round: number): Promise<WikipediaPerson> {
  // Always fetch fresh from Wikipedia - no caching to ensure quality
  console.log(`\n🎯 ROUND ${round}: Always fetching fresh from Wikipedia (cache disabled)`);
  
  console.log(`\n🎯 ROUND ${round}: Fetching NEW Wikipedia person from live API...`);
  
  // Try up to 5 strategies sequentially to find a valid person
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      console.log(`🔄 ATTEMPT ${attempt + 1}: Trying to get a Wikipedia person...`);
      const person = await tryGetRandomPerson();
      
      // Skip if already used
      if (usedPeople.includes(person.name)) {
        console.log(`⚠️ ATTEMPT ${attempt + 1}: "${person.name}" already used, trying next strategy...`);
        continue;
      }
      
      // Note: Section count check now happens in createPersonFromPage() before hint generation
      console.log(`✅ ATTEMPT ${attempt + 1}: Found suitable person "${person.name}" with ${person.sections.length} sections`);
      
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
    { name: "Biography Category", fn: () => getFromBiographyCategory() },
    { name: "Profession Category", fn: () => getFromRandomProfessionCategory() },
    { name: "Time Period Category", fn: () => getFromTimeperiodCategory() },
    { name: "Nationality Category", fn: () => getFromNationalityCategory() },
    { name: "Random Direct", fn: () => getRandomPersonDirect() }
  ];
  
  const selectedStrategy = strategies[Math.floor(Math.random() * strategies.length)];
  console.log(`🎯 STRATEGY: Using "${selectedStrategy.name}" approach`);
  return await selectedStrategy.fn();
}

async function getRandomPersonDirect(): Promise<WikipediaPerson> {
  // Direct random person - single attempt but with person verification
  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/random/summary`);
    const page = await response.json();
    
    // Use LLM to verify this is actually a person
    const isActualPerson = await verifyIsPersonWithLLM(page.title, page.extract || "");
    if (!isActualPerson) {
      throw new Error(`Random page "${page.title}" is not about a person`);
    }
    
    console.log(`🎲 RANDOM: LLM confirmed "${page.title}" is a person`);
    return await createPersonFromPage(page);
  } catch (error) {
    throw new Error("Could not fetch suitable random person: " + (error as Error).message);
  }
}

async function getFromBiographyCategory(): Promise<WikipediaPerson> {
  // Use more specific categories with higher person success rates
  const categories = [
    "20th-century_American_actors",
    "21st-century_American_actors", 
    "American_film_directors",
    "British_actors",
    "American_musicians",
    "British_musicians",
    "American_writers",
    "British_writers",
    "Nobel_Prize_winners",
    "Academy_Award_winners"
  ];
  
  const category = categories[Math.floor(Math.random() * categories.length)];
  console.log(`📚 BIOGRAPHY: Selected category "${category}"`);
  return await getPersonFromWikipediaCategory(category);
}

async function getFromRandomProfessionCategory(): Promise<WikipediaPerson> {
  // Use specific person-focused profession categories to reduce API calls
  const categories = [
    "American_actors", 
    "American_musicians", 
    "American_scientists", 
    "American_writers", 
    "American_film_directors",
    "British_actors",
    "British_musicians",
    "British_writers"
  ];
  const category = categories[Math.floor(Math.random() * categories.length)];
  
  console.log(`👔 PROFESSION: Selected category "${category}"`);
  return await getPersonFromWikipediaCategory(category);
}

async function getFromTimeperiodCategory(): Promise<WikipediaPerson> {
  const periods = [
    "Renaissance_people"
  ];
  
  const period = periods[Math.floor(Math.random() * periods.length)];
  return await getPersonFromWikipediaCategory(period);
}

async function getFromNationalityCategory(): Promise<WikipediaPerson> {
  // Use more specific nationality-based categories that are more likely to contain people
  const categories = [
    "American_actors",
    "British_actors", 
    "Canadian_actors",
    "Australian_actors",
    "American_musicians",
    "British_musicians",
    "German_scientists",
    "French_writers"
  ];
  
  const category = categories[Math.floor(Math.random() * categories.length)];
  console.log(`🌍 NATIONALITY: Selected category "${category}"`);
  return await getPersonFromWikipediaCategory(category);
}

async function verifyIsPersonWithLLM(title: string, extract: string): Promise<boolean> {
  try {
    console.log(`🤖 PERSON CHECK: Verifying if "${title}" is about a human being...`);
    
    // Get the first two sentences for better context
    const sentences = extract.split(/[.!?]+/).slice(0, 2).join('. ').trim();
    const textToAnalyze = sentences || extract.substring(0, 300);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Look at this Wikipedia entry title and opening text. 

Title: "${title}"
Text: "${textToAnalyze}"

ONLY say YES if this meets ALL criteria:
1. About exactly ONE real person (not a band, group, duo, or multiple people)
2. The title is their actual birth/legal name or commonly used real name (Wikipedia disambiguation like "(actor)" is acceptable)
3. Not about an object, concept, place, event, or organization

Examples that should be NO:
- "The Beatles" = NO (band name)
- "infinite bisous" = NO (stage name/alias)
- "Dan Berk and Robert Olsen" = NO (multiple people)
- "DJ Snake" = NO (stage name)
- "Lady Gaga" = NO (stage name)
- "50 Cent" = NO (stage name)
- "The Kut" = NO (stage name)
- "iPhone 15" = NO (not a person)
- "Coronation of Edward VI" = NO (historical event)

Examples that should be YES:
- "Albert Einstein" = YES (real name of one person)
- "Marie Curie" = YES (real name of one person)
- "Barack Obama" = YES (real name of one person)
- "John Means (comedian)" = YES (real name with disambiguation)
- "Tom McKinney (broadcaster)" = YES (real name with disambiguation)

Say only YES or NO, nothing else.`
        }
      ],
      max_tokens: 5,
      temperature: 0
    });

    const result = response.choices[0].message.content?.trim().toUpperCase();
    const isPersonResult = result === 'YES';
    
    console.log(`🤖 PERSON CHECK RESULT: "${title}" -> ${isPersonResult ? 'CONFIRMED REAL PERSON NAME ✅' : 'NOT REAL PERSON NAME ❌'} (LLM said: ${result})`);
    return isPersonResult;
  } catch (error) {
    console.log(`🤖 PERSON CHECK ERROR: LLM verification failed for "${title}", using fallback logic`);
    const fallbackResult = isProbablyPerson(title, extract);
    console.log(`🤖 FALLBACK RESULT: "${title}" -> ${fallbackResult ? 'PERSON' : 'NOT PERSON'}`);
    return fallbackResult;
  }
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
    
    // Single attempt to minimize API calls
    const randomMember = members[Math.floor(Math.random() * members.length)];
    console.log(`Trying member: ${randomMember.title}`);
    
    // Get page summary
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(randomMember.title)}`;
    console.log(`Fetching summary URL: ${summaryUrl}`);
    
    const summaryResponse = await fetch(summaryUrl);
    
    if (!summaryResponse.ok) {
      throw new Error(`Summary fetch failed for ${randomMember.title}`);
    }
    
    const page = await summaryResponse.json();
    
    // Use LLM to verify this is actually a person
    const isActualPerson = await verifyIsPersonWithLLM(page.title, page.extract || "");
    if (!isActualPerson) {
      throw new Error(`Selected page "${page.title}" is not about a person`);
    }
    
    console.log(`✅ CATEGORY: LLM confirmed "${page.title}" from ${categoryName} is a person`);
    return await createPersonFromPage(page);
    
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
  
  // Check if person has enough sections BEFORE generating expensive hints
  if (sections.length < 6) {
    console.log(`⚠️ SECTIONS: "${page.title}" has only ${sections.length} sections (minimum 6 required), skipping hint generation`);
    throw new Error(`Insufficient sections: ${page.title} has only ${sections.length} sections (minimum 6 required)`);
  }
  
  // Generate both types of hints (only after confirming sufficient sections)
  console.log(`✅ SECTIONS: "${page.title}" has ${sections.length} sections, proceeding with hint generation`);
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
  const name = fullName.replace(/_/g, ' ').trim();
  
  // Handle names with initials like "J.R.R. Tolkien"
  if (name.includes('.')) {
    const parts = name.split(' ');
    // If first part has dots, extract all letters from it
    if (parts[0].includes('.')) {
      return parts[0].replace(/\./g, '').toUpperCase();
    }
  }
  
  // Handle titles and numbers like "14th Dalai Lama"
  if (/\d/.test(name)) {
    const parts = name.split(' ').filter(part => !/^\d/.test(part) && !part.includes('th') && !part.includes('st') && !part.includes('nd') && !part.includes('rd'));
    if (parts.length > 0) {
      return parts[0].charAt(0).toUpperCase();
    }
  }
  
  // Handle special cases with particles
  if (name.includes(' of ') || name.includes(' the ')) {
    // For "Alexander the Great", "Joan of Arc" -> "A", "J"
    const parts = name.split(' ');
    return parts[0].charAt(0).toUpperCase();
  }
  
  if (name.includes(' de ') || name.includes(' da ') || name.includes(' del ') || name.includes(' van ') || name.includes(' von ')) {
    // For "Leonardo da Vinci", "Vincent van Gogh" -> "L", "V"
    const parts = name.split(' ');
    return parts[0].charAt(0).toUpperCase();
  }
  
  // Default: first letter of first word
  const firstWord = name.split(' ')[0];
  return firstWord.charAt(0).toUpperCase();
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



async function fetchWikipediaData(wikipediaTitle: string): Promise<{ sections: string[], biography: string }> {
  try {
    console.log(`📖 Fetching Wikipedia data for: ${wikipediaTitle}`);
    
    // Get page summary for biography
    const summaryResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikipediaTitle)}`);
    if (!summaryResponse.ok) {
      throw new Error(`Summary API returned ${summaryResponse.status}`);
    }
    
    const summaryData = await summaryResponse.json();
    const biography = summaryData.extract || '';
    
    // Get sections using the parse API
    const sectionsResponse = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(wikipediaTitle)}&format=json&prop=sections&formatversion=2&origin=*`);
    if (!sectionsResponse.ok) {
      throw new Error(`Parse API returned ${sectionsResponse.status}`);
    }
    
    const sectionsData = await sectionsResponse.json();
    
    if (sectionsData.error) {
      throw new Error(`Wikipedia API error: ${sectionsData.error.info}`);
    }
    
    const sections = sectionsData.parse?.sections || [];
    const sectionTitles = sections
      .map((section: any) => section.line || section.anchor || 'Unknown')
      .filter(Boolean)
      .filter((title: string) => 
        !title.toLowerCase().includes('reference') && 
        !title.toLowerCase().includes('external') &&
        !title.toLowerCase().includes('see also') &&
        !title.toLowerCase().includes('notes')
      );
    
    console.log(`📖 Successfully fetched ${sectionTitles.length} sections and biography for ${wikipediaTitle}`);
    
    return {
      sections: sectionTitles,
      biography: biography
    };
    
  } catch (error) {
    console.error(`❌ Failed to fetch Wikipedia data for ${wikipediaTitle}:`, error);
    throw new Error(`Wikipedia fetch failed: ${error}`);
  }
}

async function generateAIHints(name: string, nationality: string, timeperiod: string, occupation: string, biography: string): Promise<[string, string, string]> {
  try {
    console.log(`🤖 Generating AI hints for: ${name}`);
    
    const excerpt = biography.substring(0, 1500); // Limit to 1500 chars as per user requirement
    
    const prompt = `You are creating hints for a Wikipedia guessing game about ${name}.

Context:
- Nationality: ${nationality || 'Unknown'}
- Time period: ${timeperiod || 'Historical'}
- Occupation: ${occupation || 'Historical Figure'}
- Biography excerpt: ${excerpt}

Create exactly 3 progressive hints that help players guess this person:

HINT 1 (7→2 points): A subtle, general clue about their field or era. Don't mention birthplace, birth year, or their name.
HINT 2 (2→1 points): A more specific clue about their major achievement or what they're famous for.
HINT 3 (1→1 points): A direct clue that clearly identifies them without giving away the name.

Each hint should start with "This person was a..." or "This person is known for..." format.
Keep each hint under 50 words.
Be factual and avoid mentioning birthplace, birth year, or the person's name.

Format as JSON:
{"hint1": "...", "hint2": "...", "hint3": "..."}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Use gpt-4o-mini for reliability as per user requirement
      messages: [
        {
          role: "system",
          content: "You are an expert at creating engaging, educational biographical hints for a Wikipedia guessing game."
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
    
    if (!result.hint1 || !result.hint2 || !result.hint3) {
      throw new Error('Invalid hint response from OpenAI');
    }

    console.log(`🤖 Successfully generated 3 AI hints for ${name}`);
    
    return [result.hint1, result.hint2, result.hint3];
    
  } catch (error) {
    console.error(`❌ AI hint generation failed for ${name}:`, error);
    throw new Error(`AI hint generation failed: ${error}`);
  }
}
