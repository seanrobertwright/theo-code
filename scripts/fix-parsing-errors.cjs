const fs = require('fs');
const path = require('path');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Pattern 1: if (condition { ... } -> missing closing parenthesis
  // Matches: if (something { OR if (!something(arg) {
  // Be careful not to match valid if (cond) {
  // Use a regex that looks for 'if (' followed by content that doesn't have a matching ')' before '{'
  
  // A simpler approach for the specific mangled patterns seen:
  // if ((request as any){
  //   .timeoutId) {
  // }
  content = content.replace(/if \(\(([^)]+) as any\)\{\s*\.([^)]+)\)\s*\{\s*\}/g, 'if (($1 as any).$2) {');
  content = content.replace(/if \(\(([^)]+) as any\)\{\s*\.([^)]+)\s*\{\s*\}/g, 'if (($1 as any).$2) {');
  
  // Specific one from google.ts
  // if (this.config.gemini?.thoughtSignatures && (candidate as any){
  //   .thoughtSignature) {
  // }
  content = content.replace(/if \(([^)]+) && \(([^)]+) as any\)\{\s*\.([^)]+)\)\s*\{\s*\}/g, 'if ($1 && ($2 as any).$3) {');

  // Fix: if (model.includes('gemini-3') {
  content = content.replace(/if \(([^)]+)\.([^)]+)\('([^']+)'\) \{/g, "if ($1.$2('$3')) {");
  
  // Fix generic if missing paren: if (!this.isProviderHealthy(provider) {
  content = content.replace(/if \(!this\.([^)]+)\(([^)]+)\) \{/g, 'if (!this.$1($2)) {');
  
  // Fix: if (this.migrations.has(key) {
  content = content.replace(/if \(this\.([^)]+)\.has\(([^)]+)\) \{/g, 'if (this.$1.has($2)) {');

  // Fix else if variant from anthropic.ts
  content = content.replace(/\} else if \(\(([^)]+) as any\)\{\s*\.([^)]+) === '([^']+)'\) \{\s*\}/g, "} else if (($1 as any).$2 === '$3') {");

  // Fix underscores in parameters vs usage
  // This is riskier to do globally, but let's try for known files
  if (filePath.includes('provider-manager.ts') || filePath.includes('migration.ts') || filePath.includes('loader.ts')) {
    // These were already partially fixed by my full rewrites, 
    // but just in case, this script could handle others.
  }

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
