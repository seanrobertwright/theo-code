const fs = require('fs');
const path = require('path');

function fixTokenResponseNormalization(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix naming mismatches in the arbitrary definition
  content = content.replace(/_accesstoken: accessTokenArb/g, 'access_token: accessTokenArb');
  content = content.replace(/refreshtoken: fc\.option/g, 'refresh_token: fc.option');
  
  // Fix _min and _max in fc.integer
  content = content.replace(/_min: 60/g, 'min: 60');
  content = content.replace(/_max: 86400/g, 'max: 86400');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed token response normalization in ${path.basename(filePath)}`);
}

const testFile = path.resolve(process.cwd(), 'src/features/auth/__tests__/token-response-normalization.property.test.ts');
if (fs.existsSync(testFile)) {
  fixTokenResponseNormalization(testFile);
}
