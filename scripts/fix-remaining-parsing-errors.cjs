const fs = require('fs');
const path = require('path');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix: else if (Array.isArray(message.content) {
  content = content.replace(/else if \(Array\.isArray\(([^)]+)\) \{/g, 'else if (Array.isArray($1)) {');
  
  // Fix: if (Array.isArray(something) {
  content = content.replace(/if \(Array\.isArray\(([^)]+)\) \{/g, 'if (Array.isArray($1)) {');

  // Fix: if (this.rateLimitStates.get(provider) {
  content = content.replace(/if \(this\.rateLimitStates\.get\(([^)]+)\) \{/g, 'if (this.rateLimitStates.get($1)) {');

  // Fix: if (this.providerConfigs.get(provider) {
  content = content.replace(/if \(this\.providerConfigs\.get\(([^)]+)\) \{/g, 'if (this.providerConfigs.get($1)) {');

  // Fix: if (this.providerHealth.get(provider) {
  content = content.replace(/if \(this\.providerHealth\.get\(([^)]+)\) \{/g, 'if (this.providerHealth.get($1)) {');

  fs.writeFileSync(filePath, content, 'utf8');
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
    console.log(`Fixing ${f}...`);
    fixFile(fullPath);
  }
});
