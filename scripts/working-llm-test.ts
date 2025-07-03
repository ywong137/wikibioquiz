import OpenAI from 'openai';
import { writeFileSync } from 'fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function workingLLMTest() {
  const output: string[] = [];
  output.push('WORKING LLM TEST');
  output.push(`START TIME: ${new Date().toLocaleString()}`);
  output.push('');

  try {
    output.push('Test 1: Simple hello test...');
    const response1 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say hello" }],
      max_tokens: 10
    });
    output.push(`✅ Simple test: ${response1.choices[0].message.content}`);
    output.push('');

    output.push('Test 2: JSON format test...');
    const response2 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: 'Generate JSON with keys "name" and "age": {"name": "John", "age": 30}' }],
      response_format: { type: "json_object" },
      max_tokens: 50
    });
    output.push(`✅ JSON test: ${response2.choices[0].message.content}`);
    output.push('');

    output.push('Test 3: Hint generation test (exactly like the failing one)...');
    const testPrompt = `Generate 3 progressive hints for Moses. Format as JSON: {"hint1": "...", "hint2": "...", "hint3": "..."}`;
    
    const response3 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: testPrompt }],
      response_format: { type: "json_object" },
      max_tokens: 500
    });
    
    const hints = JSON.parse(response3.choices[0].message.content || '{}');
    output.push(`✅ Hint generation test successful:`);
    output.push(`  Hint 1: ${hints.hint1}`);
    output.push(`  Hint 2: ${hints.hint2}`);
    output.push(`  Hint 3: ${hints.hint3}`);
    output.push(`  Tokens used: ${response3.usage?.total_tokens || 'unknown'}`);
    output.push('');

    output.push('✅ ALL TESTS PASSED - OpenAI API is fully functional');

  } catch (error) {
    output.push(`❌ FAILED: ${error}`);
    output.push(`Error type: ${error.constructor.name}`);
    output.push(`Error message: ${error.message}`);
    if (error.stack) {
      output.push(`Stack trace: ${error.stack}`);
    }
  }

  output.push('');
  output.push(`END TIME: ${new Date().toLocaleString()}`);

  writeFileSync('output7.txt', output.join('\n'));
  console.log('✅ LLM test complete - Results in output7.txt');
}

workingLLMTest().catch((error) => {
  console.error('❌ LLM test failed:', error);
  writeFileSync('output7.txt', `LLM TEST FAILED: ${error}\n${error.stack || 'No stack trace'}`);
});