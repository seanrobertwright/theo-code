const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const BUILD_COMMAND = 'npm';
const BUILD_ARGS = ['run', 'build'];
const OUTPUT_FILE = 'build_error.txt';
const LOG_FILE = 'build_log.txt';

console.log(`Starting build process: ${BUILD_COMMAND} ${BUILD_ARGS.join(' ')}`);

const build = spawn(BUILD_COMMAND, BUILD_ARGS, {
  shell: true,
  cwd: process.cwd(),
});

let stdoutData = '';
let stderrData = '';

build.stdout.on('data', (data) => {
  const str = data.toString();
  process.stdout.write(str); // Stream to console
  stdoutData += str;
});

build.stderr.on('data', (data) => {
  const str = data.toString();
  process.stderr.write(str); // Stream to console
  stderrData += str;
});

build.on('close', (code) => {
  console.log(`\nBuild process exited with code ${code}`);

  const fullLog = stdoutData + stderrData;
  fs.writeFileSync(LOG_FILE, fullLog);
  console.log(`Full build log saved to ${LOG_FILE}`);

  analyzeErrors(fullLog);
});

function analyzeErrors(logContent) {
  const lines = logContent.split('\n');
  const fileErrorCounts = {};
  
  // Regex to match TypeScript errors
  // Example: src/app.tsx(15,10): error TS6133: ...
  // Note: tsc output paths can be relative or absolute.
  // We'll capture the file path part.
  const errorRegex = /^(.*?)\(\d+,\d+\): error TS\d+:/;

  lines.forEach(line => {
    const match = line.match(errorRegex);
    if (match) {
      let filePath = match[1].trim();
      
      // Normalize path (optional, depending on need)
      // filePath = path.resolve(filePath); 
      
      if (!fileErrorCounts[filePath]) {
        fileErrorCounts[filePath] = 0;
      }
      fileErrorCounts[filePath]++;
    }
  });

  // Convert to array and sort
  const sortedFiles = Object.entries(fileErrorCounts)
    .sort(([, countA], [, countB]) => countB - countA);

  // Generate Report
  let report = 'Build Errors Summary (Highest to Lowest):\n';
  report += '==========================================\n\n';

  let totalErrors = 0;
  
  if (sortedFiles.length === 0) {
      report += "No TypeScript errors found (or format not matched).\n";
  } else {
      sortedFiles.forEach(([file, count]) => {
        report += `${file}: ${count} errors\n`;
        totalErrors += count;
      });
  }

  report += `\n==========================================\n`;
  report += `Total Files with Errors: ${sortedFiles.length}\n`;
  report += `Total Errors: ${totalErrors}\n`;

  fs.writeFileSync(OUTPUT_FILE, report);
  console.log(`\nError summary saved to ${OUTPUT_FILE}`);
  
  if (sortedFiles.length > 0) {
      console.log('\nTop 5 Files with Errors:');
      sortedFiles.slice(0, 5).forEach(([file, count]) => console.log(`${file}: ${count}`));
  }
}
