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
    // and it doesn't have a matching closing paren for the if
    if ((trimmed.startsWith('if (') || trimmed.startsWith('} else if (')) && trimmed.endsWith('{')) {
      // Check for balanced parens in the condition part
      let conditionPart = trimmed;
      if (trimmed.startsWith('} ')) conditionPart = trimmed.substring(2);
      
      // Simple balance check
      let openCount = 0;
      for (let char of conditionPart) {
        if (char === '(') openCount++;
        if (char === ')') openCount--;
      }
      
      if (openCount > 0) {
        // Missing at least one closing paren
        // Insert it before the space before {
        let lastBraceIndex = line.lastIndexOf('{');
        let newLine = line.substring(0, lastBraceIndex).trimEnd() + ') {';
        console.log(`Fixing line ${i+1}: ${trimmed} -> ${newLine.trim()}`);
        lines[i] = newLine;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
}

const filesToFix = [
  'src/features/model/adapters/google.ts',
  'src/features/model/request-queue.ts',
  'src/features/model/adapters/anthropic.ts',
  'src/features/session/performance.ts',
  'src/features/commands/handlers/sessions.ts'
];

filesToFix.forEach(f => {
  const fullPath = path.resolve(process.cwd(), f);
  if (fs.existsSync(fullPath)) {
    console.log(`Checking ${f}...`);
    fixFile(fullPath);
  }
});
