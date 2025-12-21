#!/usr/bin/env node

/**
 * Cleanup script for migration backup files
 * 
 * This script safely removes migration backup files that are cluttering
 * the workspace root directory. These files are created during session
 * schema migrations and are safe to delete once migrations are confirmed.
 */

import { readdir, unlink, stat } from 'fs/promises';
import { join } from 'path';

const BACKUP_FILE_PATTERN = /^[0-9a-f-]+\.migration-backup\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/;

async function cleanupMigrationBackups() {
  console.log('🧹 Starting migration backup cleanup...\n');
  
  try {
    // Read all files in current directory
    const files = await readdir('.');
    
    // Filter for migration backup files
    const backupFiles = files.filter(file => BACKUP_FILE_PATTERN.test(file));
    
    if (backupFiles.length === 0) {
      console.log('✅ No migration backup files found to clean up.');
      return;
    }
    
    console.log(`📊 Found ${backupFiles.length} migration backup files`);
    
    // Group files by age for reporting
    const now = Date.now();
    const ageGroups = {
      recent: [], // < 1 day
      week: [],   // < 1 week
      month: [],  // < 1 month
      old: []     // > 1 month
    };
    
    for (const file of backupFiles) {
      try {
        const stats = await stat(file);
        const ageMs = now - stats.mtime.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        
        if (ageDays < 1) {
          ageGroups.recent.push(file);
        } else if (ageDays < 7) {
          ageGroups.week.push(file);
        } else if (ageDays < 30) {
          ageGroups.month.push(file);
        } else {
          ageGroups.old.push(file);
        }
      } catch (error) {
        console.warn(`⚠️  Could not stat file ${file}: ${error.message}`);
        ageGroups.old.push(file); // Treat as old if we can't determine age
      }
    }
    
    // Report age distribution
    console.log('\n📅 Age distribution:');
    console.log(`   Recent (< 1 day):  ${ageGroups.recent.length} files`);
    console.log(`   Week (< 1 week):   ${ageGroups.week.length} files`);
    console.log(`   Month (< 1 month): ${ageGroups.month.length} files`);
    console.log(`   Old (> 1 month):   ${ageGroups.old.length} files`);
    
    // Ask for confirmation (in a real interactive script)
    console.log('\n🗑️  Proceeding to delete all migration backup files...');
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const file of backupFiles) {
      try {
        await unlink(file);
        deletedCount++;
        
        // Show progress for large numbers of files
        if (deletedCount % 100 === 0) {
          console.log(`   Deleted ${deletedCount}/${backupFiles.length} files...`);
        }
      } catch (error) {
        console.error(`❌ Failed to delete ${file}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Deleted: ${deletedCount} files`);
    console.log(`   Errors:  ${errorCount} files`);
    
    if (errorCount > 0) {
      console.log('\n⚠️  Some files could not be deleted. Check permissions and try again.');
      process.exit(1);
    }
    
    // Calculate space saved (rough estimate)
    const avgFileSize = 2048; // Rough estimate based on sample files
    const spaceSavedKB = Math.round((deletedCount * avgFileSize) / 1024);
    console.log(`💾 Estimated space saved: ~${spaceSavedKB} KB`);
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

// Run the cleanup
cleanupMigrationBackups().catch(error => {
  console.error('💥 Unexpected error:', error);
  process.exit(1);
});