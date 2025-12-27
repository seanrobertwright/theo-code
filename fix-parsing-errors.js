#!/usr/bin/env node

/**
 * Fix parsing errors caused by overly aggressive automated fixes
 */

import { readFileSync, writeFileSync } from 'fs';

const PARSING_ERROR_FILES = [
  'src/features/model/response-formatter.ts',
  'src/features/model/retry-logic.ts', 
  'src/features/model/validation.ts',
  'src/features/session/__tests__/filesystem.property.test.ts',
  'src/features/session/__tests__/sensitive-data-exclusion.property.test.ts',
  'src/features/session/__tests__/sharing-integrity.property.test.ts',
  'src/features/session/__tests__/storage-index.property.test.ts',
  'src/features/session/audit.ts',
  'src/features/session/enhanced-manager.ts',
  'src/features/session/filesystem.ts',
  'src/features/session/manager.ts',
  'src/features/session/migration.ts',
  'src/features/session/monitoring-service.ts',
  'src/features/session/monitoring.ts',
  'src/features/session/performance.ts',
  'src/features/session/security.ts',
  'src/features/session/startup.ts',
  'src/features/session/storage.ts',
  'src/features/tools/filesystem/index.ts',
  'src/features/tools/framework.ts',
  'src/features/tools/git/index.ts',
  'src/features/tools/lsp/index.ts',
  'src/shared/components/Layout/utils.ts',
  'src/shared/components/ProviderSelection/index.tsx',
  'src/shared/hooks/useKeyboard.ts',
  'src/shared/store/ui-layout.ts',
  'src/shared/utils/paths.ts',
  'src/shared/utils/tokenizer.ts'
];

function fixParsingErrors(content) {
  let fixed = content;
  
  // Fix broken if statements with misplaced braces
  // Pattern: if (condition){
  //   .something) {
  // }
  fixed = fixed.replace(
    /if\s*\([^)]+\)\s*{\s*\n\s*\.([^)]+)\)\s*{\s*\n\s*}/g,
    (match, condition) => {
      return `if (${condition.trim()}) {`;
    }
  );
  
  // Fix broken object access with misplaced braces
  // Pattern: Object.keys(something){
  //   .length > 0) {
  // }
  fixed = fixed.replace(
    /Object\.keys\(([^)]+)\)\s*{\s*\n\s*\.length\s*>\s*0\)\s*{\s*\n\s*}/g,
    (match, obj) => {
      return `Object.keys(${obj}).length > 0`;
    }
  );
  
  // Fix general pattern: something){
  //   .property) {
  // }
  fixed = fixed.replace(
    /([^{}\s]+)\)\s*{\s*\n\s*\.([^)]+)\)\s*{\s*\n\s*}/g,
    (match, base, property) => {
      return `${base}).${property})`;
    }
  );
  
  // Fix broken function calls with misplaced braces
  // Pattern: functionCall(){
  //   .method) {
  // }
  fixed = fixed.replace(
    /(\w+\([^)]*\))\s*{\s*\n\s*\.([^)]+)\)\s*{\s*\n\s*}/g,
    (match, funcCall, method) => {
      return `${funcCall}.${method})`;
    }
  );
  
  return fixed;
}

function main() {
  console.log('🔧 Fixing parsing errors...\n');
  
  let fixedCount = 0;
  
  for (const filePath of PARSING_ERROR_FILES) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const fixed = fixParsingErrors(content);
      
      if (fixed !== content) {
        writeFileSync(filePath, fixed, 'utf8');
        console.log(`✅ Fixed: ${filePath}`);
        fixedCount++;
      } else {
        console.log(`⏭️  No changes needed: ${filePath}`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }
  
  console.log(`\n📊 Summary: ${fixedCount} files fixed`);
  console.log('🔄 Run "npm run lint" to verify fixes');
}

main();