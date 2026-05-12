// Test that normName correctly matches diacritic variants

const normName = n => n.toLowerCase().trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const testCases = [
  { a: 'Ludvig Åberg', b: 'Ludvig Aberg' },
  { a: 'Ludvig Åberg', b: 'ludvig aberg' },
  { a: '  Ludvig  Åberg  ', b: 'Ludvig Aberg' }, // extra whitespace
  { a: 'Sébastien Cazalet', b: 'Sebastien Cazalet' }, // other diacritics
];

let passed = 0;
let failed = 0;

for (const { a, b } of testCases) {
  const match = normName(a) === normName(b);
  if (match) {
    console.log(`✓  "${a}" === "${b}"`);
    passed++;
  } else {
    console.log(`✗  "${a}" !== "${b}"  (got "${normName(a)}" vs "${normName(b)}")`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
