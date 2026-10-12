const fs = require('fs');

let code = '(typeof window !== "undefined" ? window : globalThis).LABS_CACHE = {\n';
for (let i = 1; i <= 9; i++) {
  const content = fs.readFileSync('labs_html/lab_' + i + '.html', 'utf8');
  code += '  ' + i + ': ' + JSON.stringify(content) + ',\n';
}
code += '};\n';
fs.writeFileSync('labs_data.js', code, 'utf8');

const start = performance.now();
require('./labs_data.js');
console.log('Keys loaded:', Object.keys(globalThis.LABS_CACHE), 'in', Math.round(performance.now() - start), 'ms');
