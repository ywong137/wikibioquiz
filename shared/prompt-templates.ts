/**
 * Centralized AI Prompt Templates
 * 
 * This is the SINGLE SOURCE OF TRUTH for all AI prompt templates.
 * When you modify these templates, they will be used in both:
 * - Production game (server/routes.ts)
 * - Test scripts
 * 
 * DO NOT copy these templates elsewhere - always import from here.
 */

export interface HintGenerationContext {
  name: string;
  nationality: string;
  timeperiod: string;
  occupation: string;
  biography: string;
}

/**
 * Main AI Hint Generation Template
 * Used for generating 3-tier progressive hints in the guessing game
 */
export function getAIHintGenerationPrompt(context: HintGenerationContext): string {
  const excerpt = context.biography.substring(0, 1500); // Limit to 1500 chars
  
  return `You are creating hints for a Wikipedia guessing game about ${context.name}.

Context:
- Nationality: ${context.nationality || 'Unknown'}
- Time period: ${context.timeperiod || 'Historical'}
- Occupation: ${context.occupation || 'Historical Figure'}
- Biography excerpt: ${excerpt}

Create exactly 3 progressive hints that help players guess this person:

HINT 1: A general clue about them that makes no reference to nationality, the time period they lived in, or occupation.  This includes references like not having the word "music" if the person is a musician or "physics" if the person was a physicist.
HINT 2: A more specific clue about their major achievement or what they're famous for.
HINT 3: A direct clue that clearly identifies them without giving away the name.

None of the clues should mention their nationality, the time period in which they worked, or their occupation/field of work.
None of the clues should mention birthplace, birth year, or the person's name (either first name or last name)
Refer to the person as he, she, or "this person" as appropriate.
Focus on their work, achievements, contributions, or notable events they were involved in
Keep each hint under 50 words.

Format as JSON (including the last field called 'traceID'):
{"hint1": "...", "hint2": "...", "hint3": "...", "traceID": "2025-07-05 1:07a"}`;
}

/**
 * System message for AI hint generation
 */
export const AI_HINT_SYSTEM_MESSAGE = "You are an expert at creating engaging, educational biographical hints for a Wikipedia guessing game.";

/**
 * OpenAI Configuration for hint generation
 */
export const AI_HINT_CONFIG = {
  model: "gpt-4o-mini", // Use gpt-4o-mini for reliability
  max_tokens: 500,
  temperature: 0.7,
  response_format: { type: "json_object" as const }
};