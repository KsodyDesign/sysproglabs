const fs = require('fs');
const { execSync } = require('child_process');

fs.mkdirSync('labs_html', { recursive: true });
const files = fs.readdirSync('.').filter(f => f.endsWith('.docx') && f.startsWith('Ретунский'));
// Sort by lab number (лаб1 .. лаб9)
files.sort((a, b) => {
  const numA = parseInt(a.match(/лаб(\d+)/)[1], 10);
  const numB = parseInt(b.match(/лаб(\d+)/)[1], 10);
  return numA - numB;
});

console.log('Files found:', files);
files.forEach((f, idx) => {
  const num = idx + 1;
  const outPath = `labs_html/lab_${num}.html`;
  console.log(`Converting ${f} -> ${outPath}`);
  execSync(`npx -y mammoth "${f}" "${outPath}"`);
  const stat = fs.statSync(outPath);
  console.log(`Done lab ${num} size: ${Math.round(stat.size / 1024)} KB`);
});
console.log('All converted successfully!');
