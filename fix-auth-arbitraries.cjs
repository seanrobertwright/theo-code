const fs = require('fs');
const path = require('path');

function fixArbitraries(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace fc.string() with fc.string({ minLength: 1 }) for fields that Zod requires to be non-empty
  content = content.replace(/provider:\s*fc\.string\(\)/g, 'provider: fc.string({ minLength: 1 })');
  content = content.replace(/clientId:\s*fc\.string\(\)/g, 'clientId: fc.string({ minLength: 1 })');
  content = content.replace(/accessToken:\s*fc\.string\(\)/g, 'accessToken: fc.string({ minLength: 1 })');
  content = content.replace(/code:\s*fc\.string\(\)/g, 'code: fc.string({ minLength: 1 })');
  content = content.replace(/message:\s*fc\.string\(\)/g, 'message: fc.string({ minLength: 1 })');
  content = content.replace(/scopes:\s*fc\.array\(fc\.string\(\)\)/g, 'scopes: fc.array(fc.string({ minLength: 1 }), { minLength: 1 })');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed arbitraries in ${path.basename(filePath)}`);
}

const files = [
  'src/features/auth/__tests__/automatic-token-refresh.property.test.ts',
  'src/features/auth/__tests__/oauth-configuration.property.test.ts',
  'src/features/auth/__tests__/token-response-normalization.property.test.ts',
  'src/features/auth/__tests__/token-security.property.test.ts',
  'src/features/auth/__tests__/token-exchange.property.test.ts'
];

files.forEach(f => {
  const fullPath = path.resolve(process.cwd(), f);
  if (fs.existsSync(fullPath)) {
    fixArbitraries(fullPath);
  }
});
