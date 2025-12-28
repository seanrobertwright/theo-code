const fs = require('fs');
const path = require('path');

function fixNaming(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Pattern: parameter with underscore used without it
  // This is hard to do perfectly with regex without a full parser, 
  // but let's target the ones we know are failing.

  const replacements = [
    { from: /\(_tokenStore: ITokenStore/g, to: '(tokenStore: ITokenStore' },
    { from: /\(_pkceGenerator: IPKCEGenerator/g, to: '(pkceGenerator: IPKCEGenerator' },
    { from: /\(_callbackServer: ICallbackServer/g, to: '(callbackServer: ICallbackServer' },
    { from: /\(_browserLauncher: IBrowserLauncher/g, to: '(browserLauncher: IBrowserLauncher' },
    { from: /\(_code: string/g, to: '(code: string' },
    { from: /\(_authenticated: boolean/g, to: '(authenticated: boolean' },
    { from: /\(_context: CommandContext/g, to: '(context: CommandContext' },
    { from: /\(_options: /g, to: '(options: ' },
    { from: /\(_metadata: /g, to: '(metadata: ' },
    { from: /\(_sessionManager: /g, to: '(sessionManager: ' },
    { from: /\(_sessionId: /g, to: '(sessionId: ' },
    { from: /\(_sessionData: /g, to: '(sessionData: ' },
    { from: /\(_backupPath: /g, to: '(backupPath: ' },
    { from: /\(_fromVersion: /g, to: '(fromVersion: ' },
    { from: /\(_toVersion: /g, to: '(toVersion: ' },
    { from: /\(_migration: /g, to: '(migration: ' },
    { from: /\(_version: /g, to: '(version: ' },
    { from: /\(_framework: /g, to: '(framework: ' },
    { from: /\(_type: MigrationErrorType/g, to: '(type: MigrationErrorType' },
    { from: /\(_message: string/g, to: '(message: string' },
    { from: /\(_apiKey: string/g, to: '(apiKey: string' },
    { from: /\(_baseUrl: string/g, to: '(baseUrl: string' },
    { from: /\(_endpoint: string/g, to: '(endpoint: string' },
    { from: /\(_request: /g, to: '(request: ' },
    { from: /\(_client: /g, to: '(client: ' },
    { from: /\(_duration: number/g, to: '(duration: number' },
    { from: /\(_operation: string/g, to: '(operation: string' },
    { from: /\(_usage: number/g, to: '(usage: number' },
    { from: /\(_cache: /g, to: '(cache: ' },
    { from: /\(_backgroundTasks: /g, to: '(backgroundTasks: ' },
    { from: /\(_startPage: number/g, to: '(startPage: number' },
    { from: /\(_count: number/g, to: '(count: number' },
    { from: /\(_pageNumber: number/g, to: '(pageNumber: number' },
    { from: /\(_currentPage: number/g, to: '(currentPage: number' },
    { from: /\(_totalItems: number/g, to: '(totalItems: number' },
    { from: /\(_index: /g, to: '(index: ' },
    { from: /\(_data: /g, to: '(data: ' },
    { from: /\(_timestamp: number/g, to: '(timestamp: number' },
    { from: /\(_accessTime: number/g, to: '(accessTime: number' },
    { from: /\(_healthy: boolean/g, to: '(healthy: boolean' },
    { from: /\(_authManager: /g, to: '(authManager: ' },
    { from: /\(_workspaceRoot: string/g, to: '(workspaceRoot: string' },
    { from: /\(_task: /g, to: '(task: ' },
  ];

  for (const r of replacements) {
    if (content.match(r.from)) {
      content = content.replace(r.from, r.to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated naming in ${path.basename(filePath)}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      fixNaming(fullPath);
    }
  });
}

walkDir(path.resolve(process.cwd(), 'src'));
