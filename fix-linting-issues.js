const fs = require('fs');
const path = require('path');

function checkLoggerImport(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('logger.') && !content.includes('import { logger }')) {
    // Add logger import
    // Determine relative path to shared/utils/logger
    const relPath = path.relative(path.dirname(filePath), path.resolve(process.cwd(), 'src/shared/utils/logger.js')).replace(/\\/g, '/');
    const importLine = `import { logger } from '${relPath.startsWith('.') ? relPath : './' + relPath}';\n`;
    
    // Insert after the last import
    const lastImportIndex = content.lastIndexOf('import ');
    if (lastImportIndex !== -1) {
        const endOfLineIndex = content.indexOf('\n', lastImportIndex);
        content = content.slice(0, endOfLineIndex + 1) + importLine + content.slice(endOfLineIndex + 1);
        console.log(`Added logger import to ${path.basename(filePath)}`);
        fs.writeFileSync(filePath, content, 'utf8');
    }
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      checkLoggerImport(fullPath);
    }
  });
}

walkDir(path.resolve(process.cwd(), 'src'));
