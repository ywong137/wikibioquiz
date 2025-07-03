import { writeFileSync } from 'fs';
import OpenAI from 'openai';

async function simpleLLMTest() {
  const output: string[] = [];
  output.push('SIMPLE OPENAI TEST');
  output.push(`START: ${new Date().toLocaleTimeString()}`);
  
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    output.push('Testing OpenAI connection...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say hello" }],
      max_tokens: 50
    });
    
    output.push(`Success: ${response.choices[0].message.content}`);
    output.push(`Tokens: ${response.usage?.total_tokens}`);
    
  } catch (error) {
    output.push(`Error: ${error}`);
  }
  
  output.push(`END: ${new Date().toLocaleTimeString()}`);
  writeFileSync('output2.txt', output.join('\n'));
  console.log('Done - check output2.txt');
}

simpleLLMTest();