const fs = require('fs');
const path = require('path');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split('\n');
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let trimmed = line.trim();
    
    // Pattern: if (condition {
    if ((trimmed.startsWith('if (') || trimmed.startsWith('} else if (')) && trimmed.endsWith('{')) {
      let openCount = 0;
      for (let char of trimmed) {
        if (char === '(') openCount++;
        if (char === ')') openCount--;
      }
      
      if (openCount > 0) {
        let lastBraceIndex = line.lastIndexOf('{');
        let newLine = line.substring(0, lastBraceIndex).trimEnd() + ') {';
        console.log(`Fixing ${path.basename(filePath)} line ${i+1}: ${trimmed} -> ${newLine.trim()}`);
        lines[i] = newLine;
        changed = true;
      }
    }
    
    // Fix: if (apiKey === undefined ?? apiKey === '') {
    // Should be: if (apiKey === undefined || apiKey === '') {
    if (line.includes('=== undefined ??')) {
        let newLine = line.replace('=== undefined ??', '=== undefined ||');
        console.log(`Fixing ${path.basename(filePath)} line ${i+1} operator: ${line.trim()} -> ${newLine.trim()}`);
        lines[i] = newLine;
        changed = true;
    }
    
    // Fix: if (!this.config.model ?? this.config.model === '') {
    if (line.includes('!this.config.model ??')) {
        let newLine = line.replace('!this.config.model ??', '!this.config.model ||');
        console.log(`Fixing ${path.basename(filePath)} line ${i+1} operator: ${line.trim()} -> ${newLine.trim()}`);
        lines[i] = newLine;
        changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      fixFile(fullPath);
    }
  });
}

walkDir(path.resolve(process.cwd(), 'src'));
