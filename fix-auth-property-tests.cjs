const fs = require('fs');
const path = require('path');

function fixTestUnderscores(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace underscored property names in arbitraries and expectations
  content = content.replace(/_accessToken/g, 'accessToken');
  content = content.replace(/_refreshToken/g, 'refreshToken');
  content = content.replace(/_expiresAt/g, 'expiresAt');
  content = content.replace(/_tokenType/g, 'tokenType');
  content = content.replace(/_scope/g, 'scope');
  content = content.replace(/_tokens/g, 'tokens');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed underscores in ${path.basename(filePath)}`);
}

const files = [
  'src/features/auth/__tests__/automatic-token-refresh.property.test.ts',
  'src/features/auth/__tests__/oauth-configuration.property.test.ts',
  'src/features/auth/__tests__/token-response-normalization.property.test.ts',
  'src/features/auth/__tests__/token-security.property.test.ts'
];

files.forEach(f => {
  const fullPath = path.resolve(process.cwd(), f);
  if (fs.existsSync(fullPath)) {
    fixTestUnderscores(fullPath);
  }
});
