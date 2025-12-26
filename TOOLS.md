# New Tools Installation Guide

This document describes the three new tools added to theo-code and their installation requirements.

## 1. AST-Grep Tool

### Description
Provides semantic code analysis and refactoring using Abstract Syntax Tree patterns.

### Installation
```bash
# Install ast-grep
npm install -g @ast-grep/cli
# or
cargo install ast-grep
```

### Available Commands
- `ast_grep` - Search code using AST patterns
- `ast_grep_rewrite` - Rewrite code using AST patterns

### Example Usage
```typescript
// Search for all function declarations
{
  "pattern": "function $NAME($ARGS) { $$$ }",
  "language": "typescript"
}

// Refactor arrow functions to regular functions
{
  "pattern": "const $NAME = ($ARGS) => { $$$ }",
  "rewrite": "function $NAME($ARGS) { $$$ }",
  "language": "typescript"
}
```

## 2. LSP (Language Server Protocol) Tools

### Description
Provides real-time code intelligence including definitions, hover information, and references.

### Installation
```bash
# TypeScript/JavaScript
npm install -g typescript-language-server typescript

# Python
pip install python-lsp-server

# Rust
rustup component add rust-analyzer

# Go
go install golang.org/x/tools/gopls@latest
```

### Available Commands
- `lsp_start` - Start LSP server for a language
- `lsp_definition` - Get symbol definition
- `lsp_hover` - Get hover information
- `lsp_references` - Find all references

### Example Usage
```typescript
// Start TypeScript LSP server
{
  "language": "typescript"
}

// Get definition of symbol at position
{
  "language": "typescript",
  "file": "src/app.ts",
  "line": 10,
  "character": 15
}
```

## 3. Git Integration Tools

### Description
Provides Git operations with AI-powered semantic commit message generation.

### Installation
Git is required (usually pre-installed on most systems):
```bash
# Verify git is installed
git --version
```

### Available Commands
- `git_status` - Get repository status
- `git_diff` - Get diff with change analysis
- `git_commit` - Create commits with AI-generated messages
- `git_log` - Get commit history

### Example Usage
```typescript
// Get current status
{}

// Analyze changes and generate commit message
{
  "generateCommit": true,
  "staged": false
}

// Create commit with auto-generated message
{
  "autoGenerate": true,
  "addAll": true
}
```

## Integration

The tools are automatically registered when theo-code starts. They integrate with:

- **Session Management**: Tool usage is tracked in sessions
- **Tool Framework**: Uses the existing tool registry and execution system
- **Error Handling**: Provides consistent error reporting
- **Security**: Respects workspace boundaries and safe mode settings

## Configuration

No additional configuration is required. The tools will:
- Automatically detect available language servers
- Use the current workspace root for operations
- Respect git repository boundaries
- Follow theo-code's existing security policies

## Troubleshooting

### AST-Grep Issues
- Ensure `ast-grep` is in your PATH
- Check language support: `ast-grep --help`

### LSP Issues  
- Verify language servers are installed
- Check server logs for startup errors
- Ensure workspace has proper language files

### Git Issues
- Verify you're in a git repository
- Check git configuration: `git config --list`
- Ensure proper permissions for git operations
