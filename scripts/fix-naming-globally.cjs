const fs = require('fs');
const path = require('path');

function fixNaming(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Pattern: constructor(_config: ModelConfig, ...) { this.config = config; ... }
  // OR: constructor(_config: ModelConfig) { this.config = config; ... }
  
  // Simple fix: if a function parameter starts with _ and is used without _ inside the function.
  // But let's just target the constructor first as it's the most common failure.
  
  content = content.replace(/constructor\(_config: ([^,)]+)([^)]*)\) \{/g, 'constructor(config: $1$2) {');
  
  // Also factory functions
  content = content.replace(/function create(\w+)Adapter\(_config: ModelConfig([^)]*)\)/g, 'function create$1Adapter(config: ModelConfig$2)');

  // Generic underscore parameter fix for common names
  content = content.replace(/\(_provider: ModelProvider\)/g, '(provider: ModelProvider)');
  content = content.replace(/\(_provider: string\)/g, '(provider: string)');
  content = content.replace(/\(_config: ModelConfig\)/g, '(config: ModelConfig)');
  content = content.replace(/\(_message: Message\)/g, '(message: Message)');
  content = content.replace(/\(_messages: Message\[\]\)/g, '(messages: Message[])');
  content = content.replace(/\(_error: unknown\)/g, '(error: unknown)');
  content = content.replace(/\(_error: any\)/g, '(error: any)');

  fs.writeFileSync(filePath, content, 'utf8');
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
console.log('Fixed naming mismatches globally.');
