const fs = require('fs');
const path = require('path');

// List of files and their syntax fixes
const fixes = [
  {
    file: 'src/features/auth/oauth-manager.ts',
    find: 'if (this.callbackServer.isRunning() {',
    replace: 'if (this.callbackServer.isRunning()) {'
  },
  {
    file: 'src/features/auth/providers/openrouter-oauth.ts',
    find: "if (tokens.scope && !tokens.scope.includes('api:read') {",
    replace: "if (tokens.scope && !tokens.scope.includes('api:read')) {"
  },
  {
    file: 'src/features/auth/__tests__/token-security.property.test.ts',
    find: 'if (key.startsWith(`${service}:`) {',
    replace: 'if (key.startsWith(`${service}:`)) {'
  },
  {
    file: 'src/features/commands/handlers/provider.ts',
    find: 'if (String(provider.name) {',
    replace: 'if (String(provider.name)'
  },
  {
    file: 'src/features/model/error-handling.ts',
    find: "if (errorMessage.includes('ECONNREFUSED') {",
    replace: "if (errorMessage.includes('ECONNREFUSED')"
  },
  {
    file: 'src/features/model/performance-monitor.ts',
    find: 'if (lastAlert && now.getTime() {',
    replace: 'if (lastAlert && (now.getTime()'
  },
  {
    file: 'src/features/model/adapters/google.ts',
    find: "if (model.includes('gemini-3') {",
    replace: "if (model.includes('gemini-3')) {"
  },
  {
    file: 'src/features/model/response-formatter.ts',
    find: 'else if (response.content && Array.isArray(response.content) {',
    replace: 'else if (response.content && Array.isArray(response.content)'
  },
  {
    file: 'src/features/model/__tests__/setup-guide-integration.test.ts',
    find: 'if (!supportedProviders.includes(provider) {',
    replace: 'if (!supportedProviders.includes(provider)) {'
  },
  {
    file: 'src/features/session/monitoring.ts',
    find: 'if (!this.operationMetrics.has(operation) {',
    replace: 'if (!this.operationMetrics.has(operation)) {'
  },
  {
    file: 'src/features/session/__tests__/sensitive-data-exclusion.property.test.ts',
    find: 'if (customPattern.length > 0 && messageContent.includes(customPattern) {',
    replace: 'if (customPattern.length > 0 && messageContent.includes(customPattern)) {'
  },
  {
    file: 'src/features/session/__tests__/storage-index.property.test.ts',
    find: 'if (!verifyChecksum(sessionData, versionedSession.checksum) {',
    replace: 'if (!verifyChecksum(sessionData, versionedSession.checksum)) {'
  },
  {
    file: 'src/features/tools/filesystem/index.ts',
    find: 'if (!isDirectory(context.workspaceRoot) {',
    replace: 'if (!isDirectory(context.workspaceRoot)) {'
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

console.log('Syntax fixes completed');