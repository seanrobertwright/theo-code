const fs = require('fs');
const path = require('path');

function fixNaming(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Generic pattern: (_paramName: Type) -> (paramName: Type)
  // And also: (_paramName: Type, ...
  // And also: ..., _paramName: Type)
  
  // Use a regex that finds underscores at the start of parameter names in function/method declarations
  const paramRegex = /\((_+\w+):/g;
  let match;
  while ((match = paramRegex.exec(content)) !== null) {
    const oldParam = match[1];
    const newParam = oldParam.replace(/^_+/, '');
    
    // Replace the parameter declaration
    const declarationRegex = new RegExp('\(' + oldParam + ':', 'g');
    content = content.replace(declarationRegex, '(' + newParam + ':');
    
    // Also handle mid-list parameters
    const midParamRegex = new RegExp(',\s*' + oldParam + ':', 'g');
    content = content.replace(midParamRegex, ', ' + newParam + ':');
    
    changed = true;
  }

  // Specific one for TokenStore.ts and others that use 'provider' variable but parameter is '_provider'
  content = content.replace(/\(_provider: ModelProvider\)/g, '(provider: ModelProvider)');
  
  // Fix specific mangled property names in results/status objects if they have underscores
  content = content.replace(/_success: (true|false)/g, 'success: $1');
  content = content.replace(/_authenticated: (true|false)/g, 'authenticated: $1');
  content = content.replace(/_needsRefresh: (true|false)/g, 'needsRefresh: $1');
  content = content.replace(/_session: null/g, 'session: null');
  content = content.replace(/_error: /g, 'error: ');
  content = content.replace(/_tokens: /g, 'tokens: ');
  content = content.replace(/_token: /g, 'token: ');
  content = content.replace(/_key: /g, 'key: ');

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
