const fs = require('fs');

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtml(html) {
  return html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function getCleanText(html) {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
}

function createCardHtml(codeText, lang, title) {
  const isBash = lang === 'bash';
  const displayTitle = title || (isBash ? 'Командная строка • Bash' : 'Листинг программы • C');
  const iconSvg = isBash 
    ? `<svg class="code-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:#4EBA6F"><polyline points="3 5 7 8 3 11"/><line x1="9" y1="11" x2="13" y2="11"/></svg>`
    : `<svg class="code-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:#FF5B2E"><polyline points="5 4.5 2 8 5 11.5"/><polyline points="11 4.5 14 8 11 11.5"/><line x1="9.5" y1="4" x2="6.5" y2="12"/></svg>`;
  
  return `<div class="code-card">
  <div class="code-bar mono">
    <span class="code-lang">
      ${iconSvg}
      <span>${escapeHtml(displayTitle)}</span>
    </span>
    <button class="code-copy-btn" title="Скопировать" type="button">
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8">
        <rect x="5" y="5" width="8" height="8" rx="1.5"/>
        <path d="M3 11V3h8"/>
      </svg>
      <span>Скопировать</span>
    </button>
  </div>
  <pre class="code-pre"><code>${escapeHtml(codeText)}</code></pre>
</div>`;
}

function isBashCommand(clean) {
  if (!clean) return false;
  let t = clean.trim();
  if (/^[$#>]\s+/.test(t)) t = t.replace(/^[$#>]\s+/, '').trim();
  if (t.startsWith('#!/bin/bash') || t.startsWith('#!/bin/sh')) return true;

  const prefixes = [
    'gcc ', 'clang ', 'g++ ', './', 'valgrind ', 'cat ', 'sudo ', 'make ', 'make$',
    'flock ', 'strace ', 'python ', 'python3 ', 'diff ', 'kill ', 'killall ', 'ps ',
    'touch ', 'chmod ', 'chown ', 'ls ', 'echo ', 'grep ', 'objdump ', 'gdb ', 'nm '
  ];
  if (prefixes.some(p => t.startsWith(p) || t === 'make' || t.startsWith('./'))) {
    const russianWords = t.match(/[а-яА-ЯёЁ]{4,}/g) || [];
    if (russianWords.length > 2 && /скомпилир|запустил|позволяет|результат|ошибка|команда/i.test(t)) {
      return false;
    }
    return true;
  }
  return false;
}

function isCodeLine(text) {
  const t = text.trim();
  if (!t) return false;
  if (/^(#include|#define|#pragma|#ifdef|#ifndef|#endif|#else|#!\/)/.test(t)) return true;
  if (/^(\/\/|\/\*|\*|\*\/)/.test(t)) return true; // Comments
  if (/^(\{|\}|\};|\);|\),|do\s*\{|\}\s*else|\}\s*while|else\s*\{|else\b)/.test(t)) return true;
  if (/^(for|while|if|switch)\s*\(/.test(t)) return true;
  if (/^(case\s+|default:)/.test(t)) return true;
  if (/^(int|void|void\*|char|double|float|long|short|unsigned|signed|size_t|ssize_t|bool|static|const|struct|typedef|extern|auto|volatile|pthread_t|pthread_mutex_t|sem_t|key_t|pid_t|HANDLE|LONG)\b/.test(t)) return true;
  if (/^(return|break;|continue;)/.test(t)) return true;
  if (/^(printf|fprintf|sprintf|snprintf|scanf|sscanf|puts|putchar|perror|pthread_|sem_|shm|msg|malloc|free|exit|abort|sleep|usleep|memset|memcpy|strcpy|strncpy|strlen|strcmp)\b/.test(t)) return true;
  if (/^(\w+\s*=\s*|\w+\[.*\]\s*=|\w+\+\+|\+\+\w+|\w+--|--\w+|\w+\s*\(.*\);)/.test(t) && !/^[А-Яа-яЁё]/.test(t)) return true;
  if (/;\s*(\/\/.*)?$/.test(t) && !/^[А-Яа-яЁё]{4,}/.test(t)) return true;
  if (/\{\s*(\/\/.*)?$/.test(t) && !/^[А-Яа-яЁё]{4,}/.test(t)) return true;
  if (/^\}\s*(\/\/.*)?$/.test(t)) return true;
  return false;
}

function isContinuationLine(text) {
  const t = text.trim();
  if (!t) return true; // Blank line inside code
  if (isCodeLine(t)) return true;
  if (/^\/\//.test(t) || /^\/\*/.test(t) || /^\*/.test(t)) return true;
  if (/^(\)|\}|\]|;|,)/.test(t)) return true;
  if (/(\)|\}|\]|;|\{)$/.test(t) && !/^[А-Яа-яЁё]{4,}/.test(t)) return true;
  return false;
}

function isMultiLineParagraphCode(html) {
  const clean = getCleanText(html);
  if (!clean) return false;
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    if (clean.startsWith('#include') || clean.startsWith('#define') || clean.startsWith('#!\/bin\/')) return true;
    let hits = 0;
    lines.forEach(l => {
      if (isCodeLine(l)) hits++;
    });
    if (hits >= 2 && hits >= lines.length * 0.4) return true;
  }
  return false;
}

function processHtml(html) {
  const tokens = [];
  const regex = /(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>)/gi;
  let match;
  let lastIdx = 0;
  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ type: 'raw', content: html.substring(lastIdx, match.index) });
    }
    const tag = match[0];
    if (/^<h[1-6]/i.test(tag)) {
      tokens.push({ type: 'h', content: tag });
    } else {
      tokens.push({ type: 'p', content: tag });
    }
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < html.length) {
    tokens.push({ type: 'raw', content: html.substring(lastIdx) });
  }

  const output = [];
  let i = 0;

  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type !== 'p') {
      output.push(tok.content);
      i++;
      continue;
    }

    const inner = tok.content.replace(/^<p[^>]*>|<\/p>$/gi, '');
    const clean = getCleanText(inner);

    // Skip redundant listing caption paragraph (e.g. <p>Листинг программы</p>) if immediately followed by code
    const isListingCaption = /^(Листинг программы|Листинг:|<em>Листинг:<\/em>|Листинг)$/i.test(clean);
    if (isListingCaption) {
      let nextP = i + 1;
      while (nextP < tokens.length && tokens[nextP].type === 'raw' && !tokens[nextP].content.trim()) nextP++;
      if (nextP < tokens.length && tokens[nextP].type === 'p') {
        const nextClean = getCleanText(tokens[nextP].content);
        if (isMultiLineParagraphCode(nextClean) || isCodeLine(nextClean)) {
          i = nextP;
          continue;
        }
      }
    }

    // 1. Bash commands
    if (isBashCommand(clean)) {
      let cmdLines = [clean];
      let j = i + 1;
      while (j < tokens.length) {
        if (tokens[j].type === 'raw' && !tokens[j].content.trim()) { j++; continue; }
        if (tokens[j].type === 'p') {
          const nextClean = getCleanText(tokens[j].content);
          if (isBashCommand(nextClean)) {
            cmdLines.push(nextClean);
            j++;
            continue;
          }
        }
        break;
      }
      output.push(createCardHtml(cmdLines.join('\n'), 'bash', 'Командная строка • Bash'));
      i = j;
      continue;
    }

    // 2. Multi-line code in a single paragraph (<br> separated from docx)
    if (isMultiLineParagraphCode(inner)) {
      const codeText = decodeHtml(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
      const isBash = codeText.startsWith('#!/bin/');
      output.push(createCardHtml(codeText, isBash ? 'bash' : 'c', isBash ? 'Скрипт • Bash' : 'Листинг программы • C'));
      i++;
      continue;
    }

    // 3. Multi-paragraph code block (one <p> per line, e.g. Appendices in Lab 2, 3, 7, 8, 9)
    if (isCodeLine(clean)) {
      let codeLines = [decodeHtml(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))];
      let j = i + 1;
      let temp = [];
      while (j < tokens.length) {
        if (tokens[j].type === 'raw' && !tokens[j].content.trim()) { j++; continue; }
        if (tokens[j].type === 'p') {
          const nextInner = tokens[j].content.replace(/^<p[^>]*>|<\/p>$/gi, '');
          const nextClean = getCleanText(nextInner);
          if (!nextClean) {
            temp.push('');
            j++;
            continue;
          }
          if (isContinuationLine(nextClean)) {
            codeLines.push(...temp);
            temp = [];
            codeLines.push(decodeHtml(nextInner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')));
            j++;
            continue;
          }
        }
        break;
      }

      if (codeLines.length >= 2) {
        const fullCode = codeLines.join('\n').trim();
        const isBash = fullCode.startsWith('#!/bin/');
        output.push(createCardHtml(fullCode, isBash ? 'bash' : 'c', isBash ? 'Скрипт • Bash' : 'Листинг программы • C'));
        i = j;
        continue;
      }
    }

    output.push(tok.content);
    i++;
  }

  return output.join('');
}

console.log('Processing all 9 labs from clean raw source...');
let labsCacheObj = {};

for (let lab = 1; lab <= 9; lab++) {
  // Always read from clean raw source
  const rawPath = fs.existsSync(`labs_html_raw/lab_${lab}.html`)
    ? `labs_html_raw/lab_${lab}.html`
    : `labs_html/lab_${lab}.html`;
  const originalHtml = fs.readFileSync(rawPath, 'utf8');
  const processedHtml = processHtml(originalHtml);
  
  // Write processed version to labs_html/
  fs.writeFileSync(`labs_html/lab_${lab}.html`, processedHtml, 'utf8');
  labsCacheObj[lab] = processedHtml;
  
  const cards = (processedHtml.match(/class="code-card"/g) || []).length;
  console.log(`Lab ${lab}: converted & saved with ${cards} code cards.`);
}

// Rebuild labs_data.js
let cacheCode = '(typeof window !== "undefined" ? window : globalThis).LABS_CACHE = {\n';
for (let lab = 1; lab <= 9; lab++) {
  cacheCode += `  ${lab}: ${JSON.stringify(labsCacheObj[lab])},\n`;
}
cacheCode += '};\n';

fs.writeFileSync('labs_data.js', cacheCode, 'utf8');
console.log('labs_data.js rebuilt successfully! Size: ' + Math.round(fs.statSync('labs_data.js').size / 1024) + ' KB');
