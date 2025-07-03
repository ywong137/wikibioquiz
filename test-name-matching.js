// Unit tests for sophisticated name matching system
// Test the proposed logic structure before implementation

// Mock the functions we're about to implement
function normalizeGuess(guess) {
  return guess.toLowerCase().trim();
}

function isCorrectGuess(guess, personName) {
  const normalizedGuess = normalizeGuess(guess);
  const normalizedName = normalizeGuess(personName);
  
  if (normalizedGuess === normalizedName) {
    return true;
  }
  
  const nameParts = normalizedName.split(/\s+/);
  const guessParts = normalizedGuess.split(/\s+/);
  
  if (guessParts.length === 1) {
    return isSurnameMatch(guessParts[0], nameParts);
  }
  
  return isValidSurnameCombo(guessParts, nameParts);
}

function isSurnameMatch(guess, nameParts) {
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

function findFirstNameEnd(nameParts) {
  const connectors = new Set(['van', 'von', 'de', 'del', 'della', 'di', 'da', 'du', 'le', 'la', 'el', 'al', 'ibn', 'bin', 'of', 'mac', 'mc', 'o', 'fitz']);
  
  for (let i = 0; i < nameParts.length; i++) {
    if (connectors.has(nameParts[i].toLowerCase())) {
      return i;
    }
  }
  
  if (nameParts.length >= 3) return 2;
  if (nameParts.length === 2) return 1;
  return 0;
}

function isValidSurnameCombo(guessParts, nameParts) {
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

function findContiguousMatch(guessParts, nameParts) {
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

// TEST SUITE
function runTests() {
  const tests = [
    // === BASIC SINGLE NAMES ===
    { name: "Muhammad", guess: "Muhammad", expected: true, description: "Single name - exact match" },
    
    // === SIMPLE TWO-PART NAMES ===
    { name: "John Updike", guess: "John Updike", expected: true, description: "Full name match" },
    { name: "John Updike", guess: "Updike", expected: true, description: "Last name only" },
    { name: "John Updike", guess: "John", expected: false, description: "First name only - REJECT" },
    
    // === NAMES WITH CONNECTORS ===
    { name: "Ludwig van Beethoven", guess: "Ludwig van Beethoven", expected: true, description: "Full name with connector" },
    { name: "Ludwig van Beethoven", guess: "Beethoven", expected: true, description: "Final surname" },
    { name: "Ludwig van Beethoven", guess: "van Beethoven", expected: true, description: "Connector + surname" },
    { name: "Ludwig van Beethoven", guess: "Ludwig", expected: false, description: "First name only - REJECT" },
    { name: "Ludwig van Beethoven", guess: "van", expected: false, description: "Connector only - REJECT" },
    { name: "Ludwig van Beethoven", guess: "Ludwig van", expected: false, description: "First name + connector - REJECT" },
    
    // === COMPOUND SURNAMES ===
    { name: "Vittorio De Sica", guess: "De Sica", expected: true, description: "Compound surname" },
    { name: "Vittorio De Sica", guess: "Sica", expected: true, description: "Final part of compound surname" },
    { name: "Vittorio De Sica", guess: "De", expected: false, description: "Connector part only - REJECT" },
    { name: "Vittorio De Sica", guess: "Vittorio", expected: false, description: "First name - REJECT" },
    { name: "Vittorio De Sica", guess: "Vittorio De", expected: false, description: "First name + connector - REJECT" },
    
    // === COMPLEX MULTI-PART NAMES ===
    { name: "Rudolf von Laban", guess: "Laban", expected: true, description: "Final surname" },
    { name: "Rudolf von Laban", guess: "von Laban", expected: true, description: "Connector + surname" },
    { name: "Rudolf von Laban", guess: "Rudolf", expected: false, description: "First name - REJECT" },
    { name: "Rudolf von Laban", guess: "von", expected: false, description: "Connector only - REJECT" },
    { name: "Rudolf von Laban", guess: "Rudolf von", expected: false, description: "First name + connector - REJECT" },
    
    // === TRIPLE NAMES ===
    { name: "Jean-Baptiste Grenouille", guess: "Grenouille", expected: true, description: "Hyphenated first name, accept surname" },
    { name: "Jean-Baptiste Grenouille", guess: "Jean-Baptiste", expected: false, description: "Hyphenated first name - REJECT" },
    
    // === INTERNATIONAL CONNECTORS ===
    { name: "Leonardo da Vinci", guess: "da Vinci", expected: true, description: "Italian connector + surname" },
    { name: "Leonardo da Vinci", guess: "Vinci", expected: true, description: "Italian surname only" },
    { name: "Leonardo da Vinci", guess: "da", expected: false, description: "Italian connector only - REJECT" },
    { name: "Leonardo da Vinci", guess: "Leonardo", expected: false, description: "First name - REJECT" },
    { name: "Leonardo da Vinci", guess: "Leonardo da", expected: false, description: "First name + Italian connector - REJECT" },
    
    // === MIDDLE NAMES ===
    { name: "John Fitzgerald Kennedy", guess: "Kennedy", expected: true, description: "Surname with middle name" },
    { name: "John Fitzgerald Kennedy", guess: "Fitzgerald Kennedy", expected: true, description: "Middle + surname" },
    { name: "John Fitzgerald Kennedy", guess: "John", expected: false, description: "First name with middle - REJECT" },
    { name: "John Fitzgerald Kennedy", guess: "Fitzgerald", expected: false, description: "Middle name only - REJECT" },
    { name: "John Fitzgerald Kennedy", guess: "John Fitzgerald", expected: false, description: "First + middle name - REJECT" },
    
    // === SCOTTISH/IRISH NAMES ===
    { name: "Sean MacDonald", guess: "MacDonald", expected: true, description: "Scottish Mac surname" },
    { name: "Sean MacDonald", guess: "Sean", expected: false, description: "First name with Mac surname - REJECT" },
    
    // === ARABIC NAMES ===
    { name: "Omar ibn Khattab", guess: "ibn Khattab", expected: true, description: "Arabic connector + surname" },
    { name: "Omar ibn Khattab", guess: "Khattab", expected: true, description: "Arabic surname only" },
    { name: "Omar ibn Khattab", guess: "ibn", expected: false, description: "Arabic connector only - REJECT" },
    { name: "Omar ibn Khattab", guess: "Omar", expected: false, description: "Arabic first name - REJECT" },
    
    // === EDGE CASES ===
    { name: "Emperor Huizong of Song", guess: "Huizong", expected: false, description: "Title + name - first name should be rejected" },
    { name: "14th Dalai Lama", guess: "Lama", expected: true, description: "Title with number - accept title part" },
    { name: "14th Dalai Lama", guess: "Dalai", expected: false, description: "Middle title part - REJECT" },
  ];
  
  console.log("🧪 RUNNING NAME MATCHING TESTS\n");
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach((test, index) => {
    const result = isCorrectGuess(test.guess, test.name);
    const status = result === test.expected ? "✅ PASS" : "❌ FAIL";
    
    if (result === test.expected) {
      passed++;
    } else {
      failed++;
      console.log(`${status} Test ${index + 1}: ${test.description}`);
      console.log(`   Name: "${test.name}" | Guess: "${test.guess}"`);
      console.log(`   Expected: ${test.expected} | Got: ${result}\n`);
    }
  });
  
  console.log(`\n📊 TEST RESULTS:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log(`\n🎉 ALL TESTS PASSED! Logic is ready for implementation.`);
  } else {
    console.log(`\n⚠️  ${failed} tests failed. Logic needs refinement.`);
  }
}

// Run the tests
runTests();