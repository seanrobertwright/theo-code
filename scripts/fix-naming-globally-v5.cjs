const fs = require('fs');
const path = require('path');

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\\]/g, '\\$&');
}

function fixNaming(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  const paramRegex = /\(_+\w+):/g;
  let match;
  while ((match = paramRegex.exec(content)) !== null) {
    const oldParam = match[1];
    const newParam = oldParam.replace(/^_+/, '');
    
    const declarationRegex = new RegExp('\\(' + escapeRegExp(oldParam) + ':', 'g');
    content = content.replace(declarationRegex, '(' + newParam + ':');
    
    const midParamRegex = new RegExp(',\\s*' + escapeRegExp(oldParam) + ':', 'g');
    content = content.replace(midParamRegex, ', ' + newParam + ':');
    
    changed = true;
  }

  const underscoreMatches = [
    { from: /_success: (true|false)/g, to: 'success: $1' },
    { from: /_authenticated: (true|false)/g, to: 'authenticated: $1' },
    { from: /_needsRefresh: (true|false)/g, to: 'needsRefresh: $1' },
    { from: /_session: null/g, to: 'session: null' },
    { from: /_error: /g, to: 'error: ' },
    { from: /_tokens: /g, to: 'tokens: ' },
    { from: /_token: /g, to: 'token: ' },
    { from: /_key: /g, to: 'key: ' },
    { from: /_data: /g, to: 'data: ' },
    { from: /_usage: /g, to: 'usage: ' }
  ];

  for (const r of underscoreMatches) {
    if (content.match(r.from)) {
      content = content.replace(r.from, r.to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Deep fixed naming in ${path.basename(filePath)}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      fixNaming(fullPath);
    }
  });
}

walkDir(path.resolve(process.cwd(), 'src'));
