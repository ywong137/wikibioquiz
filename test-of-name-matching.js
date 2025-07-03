// Test the new restrictive "of" name matching implementation

function normalizeGuess(str) {
  return str.toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[çč]/g, 'c')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[ñ]/g, 'n')
    .replace(/[òóôõöø]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/[ß]/g, 's');
}

function isOfNameMatch(guess, fullName) {
  if (guess === fullName) {
    return true;
  }
  
  // Handle comma + 'of' pattern: 'Diana, Princess of Wales'
  if (fullName.includes(', ') && fullName.includes(' of ')) {
    const commaIndex = fullName.indexOf(', ');
    const ofIndex = fullName.indexOf(' of ');
    
    if (commaIndex < ofIndex) {
      const firstName = fullName.substring(0, commaIndex).trim();
      const titlePart = fullName.substring(commaIndex + 2, ofIndex).trim();
      
      if (guess === firstName) {
        return true; // 'Diana'
      }
      
      if (guess === titlePart + ' ' + firstName) {
        return true; // 'Princess Diana'
      }
      
      return false;
    }
  }
  
  // Standard 'of' pattern: 'Ivan V of Russia', 'Catherine of Aragon'
  const ofIndex = fullName.indexOf(' of ');
  if (ofIndex > 0) {
    const beforeOf = fullName.substring(0, ofIndex).trim();
    
    if (guess === beforeOf) {
      return true;
    }
  }
  
  return false;
}

function testOfNameMatching(name, validGuesses, invalidGuesses) {
  const normalizedName = normalizeGuess(name);
  
  console.log(`\n=== Testing: "${name}" ===`);
  
  console.log('✅ Should ACCEPT:');
  validGuesses.forEach(guess => {
    const normalizedGuess = normalizeGuess(guess);
    const result = isOfNameMatch(normalizedGuess, normalizedName);
    console.log(`  "${guess}" -> ${result ? '✅' : '❌'}`);
  });
  
  console.log('❌ Should REJECT:');
  invalidGuesses.forEach(guess => {
    const normalizedGuess = normalizeGuess(guess);
    const result = isOfNameMatch(normalizedGuess, normalizedName);
    console.log(`  "${guess}" -> ${result ? '❌' : '✅'}`);
  });
}

// Run comprehensive tests
console.log('🎯 COMPREHENSIVE "OF" NAME MATCHING TESTS');

// Test 1: Ivan V of Russia
testOfNameMatching(
  'Ivan V of Russia',
  ['Ivan V', 'Ivan V of Russia'],
  ['Ivan', 'Russia', 'V', 'of', 'V of Russia', 'Ivan Russia']
);

// Test 2: Catherine of Aragon
testOfNameMatching(
  'Catherine of Aragon',
  ['Catherine', 'Catherine of Aragon'],
  ['Aragon', 'of', 'of Aragon', 'Catherine Aragon']
);

// Test 3: Emperor Zhao of Han
testOfNameMatching(
  'Emperor Zhao of Han',
  ['Emperor Zhao', 'Emperor Zhao of Han'],
  ['Emperor', 'Zhao', 'Han', 'of', 'of Han', 'Emperor Han', 'Zhao of Han']
);

// Test 4: Diana, Princess of Wales
testOfNameMatching(
  'Diana, Princess of Wales',
  ['Diana', 'Princess Diana', 'Diana, Princess of Wales'],
  ['Princess', 'Wales', 'Diana, Princess', 'of Wales', 'Diana Wales', 'Princess of Wales']
);

// Test 5: Joan of Arc
testOfNameMatching(
  'Joan of Arc',
  ['Joan', 'Joan of Arc'],
  ['Arc', 'of', 'of Arc', 'Joan Arc']
);

console.log('\n🏆 All tests completed!');
console.log('✅ = Test passed (correct result)');
console.log('❌ = Test failed (incorrect result)');