#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable no-undef */

/**
 * Fix remaining parsing errors with more comprehensive patterns
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

function getAllTsFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const items = readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = join(currentDir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!['node_modules', 'dist', 'coverage', '.git'].includes(item)) {
          traverse(fullPath);
        }
      } else if (['.ts', '.tsx'].includes(extname(item))) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

function fixParsingErrors(content) {
  let fixed = content;
  
  // Fix pattern: if (condition){
  //     ) {
  //   }
  fixed = fixed.replace(
    /if\s*\([^)]+\)\s*{\s*\n\s*\)\s*{\s*\n\s*}/g,
    (match) => {
      // Extract the condition from the original if statement
      const conditionMatch = match.match(/if\s*\(([^)]+)\)/);
      if (conditionMatch) {
        return `if (${conditionMatch[1]}) {`;
      }
      return match;
    }
  );
  
  // Fix pattern: something.method(){
  //     ) {
  //   }
  fixed = fixed.replace(
    /(\w+(?:\.\w+)*\([^)]*\))\s*{\s*\n\s*\)\s*{\s*\n\s*}/g,
    (match, methodCall) => {
      return `${methodCall}) {`;
    }
  );
  
  // Fix pattern: condition){
  //     ) {
  //   }
  fixed = fixed.replace(
    /([^{}\n]+)\)\s*{\s*\n\s*\)\s*{\s*\n\s*}/g,
    (match, condition) => {
      return `${condition}) {`;
    }
  );
  
  // Fix broken parentheses patterns
  fixed = fixed.replace(
    /{\s*\n\s*\)\s*{\s*\n\s*}/g,
    ') {'
  );
  
  return fixed;
}

function main() {
  console.log('🔧 Fixing remaining parsing errors...\n');
  
  const files = getAllTsFiles('./src');
  let fixedCount = 0;
  
  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const fixed = fixParsingErrors(content);
      
      if (fixed !== content) {
        writeFileSync(filePath, fixed, 'utf8');
        console.log(`✅ Fixed: ${filePath}`);
        fixedCount++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${filePath}:`, error.message);
    }
  }
  
  console.log(`\n📊 Summary: ${fixedCount} files fixed`);
}

main();