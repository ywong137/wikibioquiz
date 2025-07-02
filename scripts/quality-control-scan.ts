import { db } from "../server/db";
import { famousPeople } from "../shared/schema";
import { eq } from "drizzle-orm";

// Test our initials generation algorithm
function generateInitials(fullName: string): string {
  const name = fullName.replace(/_/g, ' ').trim();
  
  // Handle special cases
  if (name.includes(' of ')) {
    // For "Leonardo da Vinci" or "Alexander of Macedonia"
    const parts = name.split(' ');
    return parts[0].charAt(0).toUpperCase();
  }
  
  if (name.includes(' de ') || name.includes(' da ') || name.includes(' del ') || name.includes(' van ')) {
    // For names with particles like "Leonardo da Vinci", "Vincent van Gogh"
    const parts = name.split(' ');
    return parts[0].charAt(0).toUpperCase();
  }
  
  // Handle titles and numbers
  if (/\d/.test(name)) {
    // For "14th Dalai Lama", "Louis XIV"
    const parts = name.split(' ').filter(part => !/^\d/.test(part));
    if (parts.length > 0) {
      return parts[0].charAt(0).toUpperCase();
    }
  }
  
  // Handle initials in names like "J.R.R. Tolkien"
  if (name.includes('.')) {
    const parts = name.split(' ');
    // If first part has dots, use it as is
    if (parts[0].includes('.')) {
      return parts[0].replace(/\./g, '').toUpperCase();
    }
  }
  
  // Default: first letter of first word
  const firstWord = name.split(' ')[0];
  return firstWord.charAt(0).toUpperCase();
}

// List of common single names that would be confusing
const CONFUSING_SINGLE_NAMES = new Set([
  'Sarah', 'Jerome', 'Helena', 'Diana', 'Victoria', 'Alexander', 'David', 'Michael', 
  'John', 'James', 'Robert', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth',
  'Barbara', 'Susan', 'Jessica', 'Karen', 'Nancy', 'Lisa', 'Betty', 'Helen',
  'Sandra', 'Donna', 'Carol', 'Ruth', 'Sharon', 'Michelle', 'Laura', 'Sarah',
  'Kimberly', 'Deborah', 'Dorothy', 'Lisa', 'Nancy', 'Karen', 'Betty', 'Helen',
  'Christopher', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven',
  'Paul', 'Andrew', 'Joshua', 'Kenneth', 'Kevin', 'Brian', 'George', 'Edward',
  'Ronald', 'Timothy', 'Jason', 'Jeffrey', 'Ryan', 'Jacob', 'Gary', 'Nicholas',
  'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon', 'Benjamin',
  'Samuel', 'Gregory', 'Frank', 'Raymond', 'Alexander', 'Patrick', 'Jack', 'Dennis',
  'Jerry', 'Tyler', 'Aaron', 'Jose', 'Henry', 'Adam', 'Douglas', 'Nathan', 'Peter',
  'Zachary', 'Kyle', 'Noah', 'Alan', 'Ethan', 'Jeremy', 'Lionel', 'Arthur', 'Francis',
  'Wayne', 'Roy', 'Eugene', 'Louis', 'Philip', 'Bobby', 'Ralph', 'Carl', 'Harold',
  'Jordan', 'Jesse', 'Sean', 'Thomas', 'Walter', 'Albert', 'Teresa', 'Monica',
  'Irene', 'Rose', 'Claude', 'Guy', 'Andre', 'Marie', 'Pierre', 'Jean', 'Michel',
  'Bernard', 'Alain', 'Philippe', 'Jacques', 'Antoine', 'Laurent', 'Sebastien',
  'Marco', 'Andrea', 'Francesco', 'Luca', 'Giovanni', 'Roberto', 'Stefano',
  'Angela', 'Francesca', 'Paola', 'Laura', 'Valentina', 'Chiara', 'Federica',
  'Alessandra', 'Claudia', 'Monica', 'Giulia', 'Roberta', 'Cristina', 'Daniela',
  'Hans', 'Klaus', 'Wolfgang', 'Jurgen', 'Helmut', 'Manfred', 'Bernd', 'Dieter',
  'Petra', 'Sabine', 'Gabriele', 'Monika', 'Ursula', 'Ingrid', 'Christa', 'Brigitte'
]);

// Acceptable single names (historical/ancient figures)
const ACCEPTABLE_SINGLE_NAMES = new Set([
  'Plato', 'Aristotle', 'Socrates', 'Homer', 'Herodotus', 'Thucydides', 'Euclid',
  'Archimedes', 'Pythagoras', 'Democritus', 'Hippocrates', 'Sophocles', 'Euripides',
  'Aeschylus', 'Aristophanes', 'Pindar', 'Sappho', 'Anacreon', 'Alcaeus', 'Solon',
  'Pericles', 'Themistocles', 'Alcibiades', 'Xenophon', 'Isocrates', 'Demosthenes',
  'Cicero', 'Virgil', 'Horace', 'Ovid', 'Tacitus', 'Livy', 'Plutarch', 'Seneca',
  'Lucretius', 'Catullus', 'Juvenal', 'Martial', 'Pliny', 'Suetonius', 'Apuleius',
  'Confucius', 'Laozi', 'Mencius', 'Zhuangzi', 'Xunzi', 'Mozi', 'Legalism',
  'Buddha', 'Mahavira', 'Nagarjuna', 'Asanga', 'Vasubandhu', 'Shankara',
  'Ramanuja', 'Madhva', 'Nimbarka', 'Vallabha', 'Chaitanya', 'Kabir', 'Nanak',
  'Tulsidas', 'Surdas', 'Mirabai', 'Rahim', 'Raskhan', 'Bihari', 'Bhartrhari',
  'Kalidasa', 'Bhasa', 'Sudraka', 'Vishakhadatta', 'Dandin', 'Bana', 'Bharavi',
  'Magha', 'Sriharsha', 'Jayadeva', 'Somadeva', 'Kshemendra', 'Bilhana', 'Kalhana',
  'Dante', 'Petrarch', 'Boccaccio', 'Chaucer', 'Villon', 'Rabelais', 'Montaigne',
  'Ronsard', 'Malherbe', 'Corneille', 'Racine', 'Moliere', 'Boileau', 'Bossuet',
  'Fenelon', 'Bayle', 'Fontenelle', 'Marivaux', 'Prevost', 'Lesage', 'Montesquieu',
  'Voltaire', 'Diderot', 'Rousseau', 'Buffon', 'Condorcet', 'Chamfort', 'Rivarol',
  'Chateaubriand', 'Stendhal', 'Balzac', 'Hugo', 'Musset', 'Vigny', 'Lamartine',
  'Michelet', 'Renan', 'Taine', 'Flaubert', 'Baudelaire', 'Verlaine', 'Mallarme',
  'Rimbaud', 'Zola', 'Maupassant', 'Anatole', 'Proust', 'Gide', 'Claudel', 'Valery',
  'Apollinaire', 'Cocteau', 'Mauriac', 'Bernanos', 'Malraux', 'Sartre', 'Camus',
  'Beckett', 'Ionesco', 'Robbe-Grillet', 'Butor', 'Sarraute', 'Duras', 'Modiano',
  'Michelangelo', 'Raphael', 'Donatello', 'Botticelli', 'Ghiberti', 'Brunelleschi',
  'Masaccio', 'Piero', 'Mantegna', 'Bellini', 'Giorgione', 'Titian', 'Tintoretto',
  'Veronese', 'Caravaggio', 'Bernini', 'Borromini', 'Guarini', 'Juvarra', 'Piranesi',
  'Canaletto', 'Tiepolo', 'Canova', 'Thorvaldsen', 'Ingres', 'Delacroix', 'Courbet',
  'Manet', 'Monet', 'Renoir', 'Degas', 'Cezanne', 'Gauguin', 'Seurat', 'Signac',
  'Toulouse-Lautrec', 'Picasso', 'Matisse', 'Braque', 'Leger', 'Dufy', 'Vlaminck',
  'Derain', 'Marquet', 'Friesz', 'Rouault', 'Utrillo', 'Soutine', 'Modigliani',
  'Chagall', 'Ernst', 'Miro', 'Dali', 'Magritte', 'Tanguy', 'Delvaux', 'Ensor',
  'Khnopff', 'Spilliaert', 'Permeke', 'Wouters', 'Frits', 'Appel', 'Corneille',
  'Rembrandt', 'Vermeer', 'Hals', 'Ruisdael', 'Hobbema', 'Cuyp', 'Steen', 'Metsu',
  'Terborch', 'Dou', 'Mieris', 'Neer', 'Hooch', 'Fabritius', 'Maes', 'Berchem',
  'Wouwerman', 'Ostade', 'Teniers', 'Brouwer', 'Craesbeeck', 'Jordaens', 'Rubens',
  'Dyck', 'Bosch', 'Bruegel', 'Matsys', 'Patinir', 'Gossaert', 'Cranach', 'Holbein',
  'Dürer', 'Grünewald', 'Altdorfer', 'Baldung', 'Burgkmair', 'Schongauer', 'Riemenschneider',
  'Stoss', 'Pacher', 'Multscher', 'Witz', 'Lochner', 'Moser', 'Parler', 'Sluter',
  'Claus', 'Broederlam', 'Bouts', 'Goes', 'Memling', 'David', 'Massys', 'Gossaert',
  'Orley', 'Floris', 'Mor', 'Pourbus', 'Vos', 'Francken', 'Brouwer', 'Craesbeeck'
]);

async function analyzeNames() {
  console.log("🔍 Starting quality control scan of 10,000 famous people...");
  
  // Get all names from database
  const allPeople = await db.select().from(famousPeople);
  console.log(`📊 Analyzing ${allPeople.length} names...`);
  
  const problematicNames: Array<{
    id: number;
    name: string;
    issue: string;
    initials: string;
    recommendation: 'filter' | 'algorithm_fix';
  }> = [];
  
  for (const person of allPeople) {
    const name = person.name;
    const cleanName = name.replace(/_/g, ' ').trim();
    const initials = generateInitials(name);
    
    // Check 1: Single names that are also common names
    if (!cleanName.includes(' ')) {
      if (CONFUSING_SINGLE_NAMES.has(cleanName)) {
        problematicNames.push({
          id: person.id,
          name: cleanName,
          issue: 'Single name that is also a common modern name',
          initials,
          recommendation: 'filter'
        });
        continue;
      }
      
      if (!ACCEPTABLE_SINGLE_NAMES.has(cleanName)) {
        // Check if it's a likely confusing single name
        if (cleanName.length < 6 && /^[A-Z][a-z]+$/.test(cleanName)) {
          problematicNames.push({
            id: person.id,
            name: cleanName,
            issue: 'Single name that may be confusing',
            initials,
            recommendation: 'filter'
          });
          continue;
        }
      }
    }
    
    // Check 2: Names with numbers or titles that might not work well
    if (/\d/.test(cleanName)) {
      if (cleanName.includes('Dalai Lama') || cleanName.includes('Pope ') || cleanName.includes('King ') || cleanName.includes('Queen ')) {
        problematicNames.push({
          id: person.id,
          name: cleanName,
          issue: 'Title with number - may be confusing in guessing game',
          initials,
          recommendation: 'filter'
        });
        continue;
      }
    }
    
    // Check 3: Names that generate confusing initials
    if (initials.length === 0 || initials === '?') {
      problematicNames.push({
        id: person.id,
        name: cleanName,
        issue: 'Cannot generate proper initials',
        initials,
        recommendation: 'algorithm_fix'
      });
      continue;
    }
    
    // Check 4: Very long names that might be unwieldy
    if (cleanName.length > 50) {
      problematicNames.push({
        id: person.id,
        name: cleanName,
        issue: 'Name too long for game interface',
        initials,
        recommendation: 'filter'
      });
      continue;
    }
    
    // Check 5: Names with special characters that might cause issues
    if (/[^\w\s\-\.']/g.test(cleanName)) {
      const specialChars = cleanName.match(/[^\w\s\-\.']/g);
      problematicNames.push({
        id: person.id,
        name: cleanName,
        issue: `Contains special characters: ${specialChars?.join(', ')}`,
        initials,
        recommendation: 'filter'
      });
      continue;
    }
    
    // Check 6: Names that are clearly not persons (bands, places, etc.)
    if (cleanName.includes(' and ') || cleanName.includes(' & ')) {
      problematicNames.push({
        id: person.id,
        name: cleanName,
        issue: 'Likely multiple people or band name',
        initials,
        recommendation: 'filter'
      });
      continue;
    }
  }
  
  console.log(`\n🚨 Found ${problematicNames.length} problematic names:\n`);
  
  // Group by recommendation
  const toFilter = problematicNames.filter(p => p.recommendation === 'filter');
  const toFixAlgorithm = problematicNames.filter(p => p.recommendation === 'algorithm_fix');
  
  console.log(`🔥 FILTER OUT (${toFilter.length} names):`);
  toFilter.forEach(p => {
    console.log(`   ${p.name} (${p.initials}) - ${p.issue}`);
  });
  
  console.log(`\n🔧 ALGORITHM FIXES NEEDED (${toFixAlgorithm.length} names):`);
  toFixAlgorithm.forEach(p => {
    console.log(`   ${p.name} (${p.initials}) - ${p.issue}`);
  });
  
  // Test our initials algorithm on specific examples
  console.log(`\n🧪 TESTING INITIALS ALGORITHM:`);
  const testNames = [
    'J.R.R. Tolkien',
    '14th Dalai Lama', 
    'Leonardo da Vinci',
    'Vincent van Gogh',
    'Alexander the Great',
    'Louis XIV',
    'Mary, Queen of Scots',
    'Francis of Assisi',
    'Joan of Arc',
    'William the Conqueror'
  ];
  
  testNames.forEach(name => {
    const initials = generateInitials(name);
    console.log(`   ${name} → ${initials}`);
  });
  
  // Apply filters to database
  if (toFilter.length > 0) {
    console.log(`\n🔄 Applying filters to database...`);
    
    for (const person of toFilter) {
      await db
        .update(famousPeople)
        .set({ filteredOut: 1 })
        .where(eq(famousPeople.id, person.id));
    }
    
    console.log(`✅ Filtered out ${toFilter.length} problematic names`);
  }
  
  // Show final statistics
  const totalActive = await db.select().from(famousPeople).where(eq(famousPeople.filteredOut, 0));
  const totalFiltered = await db.select().from(famousPeople).where(eq(famousPeople.filteredOut, 1));
  
  console.log(`\n📊 FINAL STATISTICS:`);
  console.log(`   Total names: ${allPeople.length}`);
  console.log(`   Active names: ${totalActive.length}`);
  console.log(`   Filtered out: ${totalFiltered.length}`);
  console.log(`   Filter rate: ${((totalFiltered.length / allPeople.length) * 100).toFixed(1)}%`);
  
  console.log(`\n🎯 Quality control scan complete!`);
}

// Run the analysis
analyzeNames().catch(console.error);

export { analyzeNames };