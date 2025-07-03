# OpenAI Hint Generation Prompt Template

## Final Approved Template

```
Generate 3 progressive hints for a Wikipedia guessing game about {NAME}.

Context: {NATIONALITY} {OCCUPATION} from the {TIMEPERIOD} period

Wikipedia Biography Excerpt: {BIOGRAPHY_EXCERPT}

Generate 3 hints that progressively reveal more information:
1. First hint: Start with "This person was a..." and describe their field of work. DO NOT mention birthplace or birth year.
2. Second hint: More specific achievements or notable works  
3. Third hint: Very specific details that make them identifiable

IMPORTANT RULES:
- Never use the person's name (including first name) in any hint
- Refer to them as "he", "she", or "this person" as appropriate
- Do not mention birthplace or birth year in any hint
- Focus on their work, achievements, and contributions

Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}
```

## Usage Instructions

Replace these placeholders:
- `{NAME}` - The person's full name
- `{NATIONALITY}` - Their nationality 
- `{OCCUPATION}` - Their occupation/field
- `{TIMEPERIOD}` - Their time period
- `{BIOGRAPHY_EXCERPT}` - Wikipedia biography excerpt (300 chars max)

## OpenAI Configuration

- Model: `gpt-4o-mini` (cost-effective, reliable)
- Response format: `{ type: "json_object" }`
- Max tokens: 500
- Temperature: 0.7

## Quality Requirements

- Hints must be educational and progressive
- No synthetic/fallback data - fail explicitly if APIs don't work
- Follow "nationality - timeperiod - occupation" format in context
- Tested successfully on diverse historical figures