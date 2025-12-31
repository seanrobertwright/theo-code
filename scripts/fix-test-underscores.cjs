const fs = require('fs');
const path = require('path');

function fixTestUnderscores(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix: _contextLimit -> contextLimit
  content = content.replace(/_contextLimit/g, 'contextLimit');
  content = content.replace(/_supportsToolCalling/g, 'supportsToolCalling');
  content = content.replace(/_supportsStreaming/g, 'supportsStreaming');
  content = content.replace(/_supportsReasoning/g, 'supportsReasoning');
  content = content.replace(/_supportsImageGeneration/g, 'supportsImageGeneration');
  content = content.replace(/_thoughtSignatures/g, 'thoughtSignatures');
  content = content.replace(/_nativeImageGen/g, 'nativeImageGen');

  fs.writeFileSync(filePath, content, 'utf8');
}

const testFile = path.resolve(process.cwd(), 'src/features/model/__tests__/provider-setup.integration.test.ts');
if (fs.existsSync(testFile)) {
  fixTestUnderscores(testFile);
}
console.log('Fixed underscores in provider-setup.integration.test.ts');
