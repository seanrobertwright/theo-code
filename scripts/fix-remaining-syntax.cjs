const fs = require('fs');

// List of remaining syntax fixes
const fixes = [
  {
    file: 'src/features/auth/user-guidance.ts',
    find: "if (errorType === 'access_denied' || message.includes('access_denied') {",
    replace: "if (errorType === 'access_denied' || message.includes('access_denied')) {"
  },
  {
    file: 'src/features/model/error-handling.ts',
    find: "if (errorMessage.includes('timeout') {",
    replace: "if (errorMessage.includes('timeout')"
  },
  {
    file: 'src/features/model/performance-monitor.ts',
    find: 'if (alertConfig.condition(metrics) {',
    replace: 'if (alertConfig.condition(metrics)) {'
  },
  {
    file: 'src/features/model/response-formatter.ts',
    find: 'if (response.usage && (response.usage.prompt_tokens || response.usage.completion_tokens) {',
    replace: 'if (response.usage && (response.usage.prompt_tokens || response.usage.completion_tokens)) {'
  },
  {
    file: 'src/features/session/monitoring.ts',
    find: 'if (Date.now() {',
    replace: 'if ((Date.now()'
  },
  {
    file: 'src/features/tools/filesystem/index.ts',
    find: "if (relativePath.startsWith('..') {",
    replace: "if (relativePath.startsWith('..')) {"
  },
  {
    file: 'src/features/model/__tests__/setup-guide-integration.test.ts',
    find: 'if (!supportedProviders.includes(provider)) {',
    replace: 'if (!supportedProviders.includes(_provider)) {'
  }
];

// Apply fixes
fixes.forEach(fix => {
  try {
    const filePath = fix.file;
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      if (content.includes(fix.find)) {
        content = content.replace(fix.find, fix.replace);
        fs.writeFileSync(filePath, content);
        console.log(`Fixed: ${filePath}`);
      } else {
        console.log(`Pattern not found in: ${filePath}`);
      }
    } else {
      console.log(`File not found: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error fixing ${fix.file}:`, error.message);
  }
});

console.log('Remaining syntax fixes completed');