const fs = require('fs');
const path = require('path');

function fixTestUnderscores(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix: _enabled -> enabled
  content = content.replace(/_enabled: true/g, 'enabled: true');
  content = content.replace(/_enabled: false/g, 'enabled: false');
  
  // Fix: _requestsPerMinute -> requestsPerMinute
  content = content.replace(/_requestsPerMinute/g, 'requestsPerMinute');
  content = content.replace(/_tokensPerMinute/g, 'tokensPerMinute');
  content = content.replace(/_concurrentRequests/g, 'concurrentRequests');

  fs.writeFileSync(filePath, content, 'utf8');
}

const testFile = path.resolve(process.cwd(), 'src/features/model/__tests__/provider-setup.integration.test.ts');
if (fs.existsSync(testFile)) {
  fixTestUnderscores(testFile);
}
console.log('Fixed more underscores in provider-setup.integration.test.ts');
