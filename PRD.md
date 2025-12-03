# Product Requirements Document: Universal TUI Agent CLI

## Document Version
**Version:** 1.0  
**Date:** December 3, 2025  
**Status:** Draft  
**Owner:** Engineering Team

---

## 1. Executive Summary

### 1.1 Product Vision
Build a **Universal Terminal User Interface (TUI) Agent CLI** that brings autonomous AI coding capabilities to developers' native terminal environments. The product will be model-agnostic, supporting OpenAI, Anthropic, Google Gemini, and local LLMs via Ollama, while maintaining a unified, consistent developer experience across all providers.

### 1.2 Problem Statement
Current agentic CLIs are fragmented:
- **Vendor Lock-in:** Claude Code, Gemini CLI, and Factory AI Droid lock users into specific model families
- **Context Inefficiency:** Traditional JSON-RPC tool calling saturates context windows with static definitions, consuming tens of thousands of tokens before tasks begin
- **Latency Cascades:** Multi-turn "reason-act" loops introduce network round-trips for each computation step
- **Inconsistent UX:** Each tool has different command structures, configuration patterns, and interaction paradigms
- **Security Gaps:** Inadequate sandboxing and authentication practices create "keys to the kingdom" vulnerabilities

### 1.3 Solution Overview
A TypeScript-based universal CLI that:
1. **Abstracts model differences** through a Unified Model Abstraction Layer (UMAL)
2. **Implements MCP code execution** to reduce token usage and enable stateful computation
3. **Provides robust security** via isolated-vm and Docker containerization
4. **Standardizes commands** across all supported models using an ISO-style command protocol
5. **Delivers rich TUI** using React Ink for component-based terminal interfaces

### 1.4 Success Metrics
- **Token Efficiency:** 70%+ reduction in token consumption vs. traditional tool calling for multi-step tasks
- **Model Coverage:** Support 4+ model providers (OpenAI, Anthropic, Gemini, Ollama) with feature parity
- **Security:** Zero sandbox escape incidents in production; 100% of destructive operations require user confirmation
- **Adoption:** 10,000+ monthly active developers within 6 months of GA release
- **Performance:** Sub-200ms latency for command processing; real-time token streaming

---

## 2. Target Users & Personas

### 2.1 Primary Persona: The Full-Stack Developer
- **Profile:** 5-10 years experience, works across frontend/backend/infrastructure
- **Pain Points:** Switches between multiple AI tools; wastes time copy-pasting context; concerned about security of autonomous agents
- **Goals:** Complete complex refactors faster; debug production issues with AI assistance; maintain control over code changes
- **Technical Environment:** macOS/Linux terminal, VS Code, Git, Docker

### 2.2 Secondary Persona: The AI Engineering Researcher
- **Profile:** Experimenting with local LLMs and fine-tuned models
- **Pain Points:** Limited tooling for local models; wants to compare different model behaviors on same tasks
- **Goals:** Benchmark model performance; integrate custom models; contribute to open-source agent frameworks
- **Technical Environment:** GPU workstation, Ollama, Python/TypeScript stack

### 2.3 Tertiary Persona: The Enterprise Developer
- **Profile:** Works in regulated industries (finance, healthcare) with strict security requirements
- **Pain Points:** Cannot use cloud-based AI due to data privacy concerns; needs audit trails
- **Goals:** Use AI coding assistance without data exfiltration; comply with security policies
- **Technical Environment:** Corporate network, air-gapped environments, compliance tools

---

## 3. Functional Requirements

### 3.1 Core Capabilities

#### 3.1.1 Multi-Model Support (P0)
**Requirement:** Support multiple LLM providers through a unified interface

**Acceptance Criteria:**
- [ ] User can switch between OpenAI GPT-4o, Claude 3.5 Sonnet, Gemini 1.5/2.0 Pro, and Ollama models via `/model` command
- [ ] Model-specific capabilities (tool calling, streaming, context limits) are automatically detected and adapted
- [ ] Billing/usage tracking works consistently across all providers
- [ ] Model switching persists across sessions via configuration file

**Technical Implementation:**
- Unified Model Abstraction Layer (UMAL) with provider-specific adapters
- TypeScript interface `IModelAdapter` with methods: `adaptTools()`, `generateStream()`, `getContextLimit()`
- Automatic fallback for models lacking tool calling (inject tools as system prompt instructions)

#### 3.1.2 MCP Code Execution (P0)
**Requirement:** Implement Model Context Protocol code execution as primary tool interface

**Acceptance Criteria:**
- [ ] Agent can write and execute Python/JavaScript code in sandboxed environment
- [ ] Code execution results (stdout/stderr) are captured and returned to agent
- [ ] Intermediate data remains in sandbox memory, not passed through LLM context
- [ ] Execution environment is stateful within a session (variables persist between executions)
- [ ] Token usage for multi-step computational tasks is 70%+ lower than traditional tool calling

**Technical Implementation:**
- Integration with `@modelcontextprotocol/sdk` for MCP client
- Support for both Stdio and SSE transport protocols
- Sandbox options: isolated-vm for JavaScript, Docker containers for Python/system commands

#### 3.1.3 Standardized Slash Commands (P0)
**Requirement:** Provide consistent command interface across all models

**Acceptance Criteria:**
- [ ] All commands from the Standard Command Set (SCS) are implemented and documented
- [ ] Commands work identically regardless of active model provider
- [ ] Tab completion for all slash commands in interactive mode
- [ ] Context-sensitive help via `/help` command

**Required Commands:**

**Session Management:**
- `/new` - Clear context, archive session, start fresh
- `/resume [id]` - Load previous session from interactive list
- `/exit` - Gracefully terminate session with confirmation

**Context Management:**
- `/add @file|@dir` - Inject file/directory content into context (supports glob patterns)
- `/drop @file` - Remove file from active context
- `/map [depth]` - Generate ASCII directory tree
- `/compact` - Summarize conversation history to free tokens
- `/ignore @file` - Add to session blacklist

**Execution Modes:**
- `/chat` - Standard conversational mode (default)
- `/plan` - Architect mode (generate design docs without code)
- `/build` - Builder mode (implement from existing plan)
- `/review` - Auditor mode (analyze git diff)
- `/debug` - Fixer mode (analyze last error output)
- `/shell` - Passthrough mode (raw shell command translation)

**Configuration:**
- `/model` - Switch LLM provider interactively
- `/mcp` - Manage MCP servers (list/add/remove)
- `/config` - Edit configuration settings
- `/help` - Display context-sensitive help

#### 3.1.4 Secure Sandboxing (P0)
**Requirement:** Execute agent-generated code safely without host compromise

**Acceptance Criteria:**
- [ ] JavaScript execution uses isolated-vm (separate V8 isolate, no shared memory)
- [ ] Python/system commands run in ephemeral Docker containers
- [ ] Filesystem access restricted to explicit workspace directory
- [ ] Network access disabled by default, allowlist-only when enabled
- [ ] Resource limits enforced (timeout: 30s, memory: 512MB, CPU: 1 core)
- [ ] Dangerous commands (rm -rf, sudo, DROP DATABASE) blocked or require explicit confirmation

**Technical Implementation:**
- Dual-boundary security: language-level (isolated-vm) + OS-level (Docker)
- Static analysis of code before execution (detect eval(), child_process.exec)
- Policy engine reading from `.agent-policy.yaml` configuration

#### 3.1.5 Rich TUI with React Ink (P0)
**Requirement:** Provide responsive, component-based terminal interface

**Acceptance Criteria:**
- [ ] Real-time token streaming displays agent responses as they generate
- [ ] Interactive components: model selector, file picker, diff viewer, confirmation dialogs
- [ ] Syntax highlighting for code blocks in terminal output
- [ ] Progress indicators for long-running operations (file scanning, code execution)
- [ ] Graceful degradation for terminals without ANSI color support

**Technical Implementation:**
- React Ink for component rendering
- Direct stdout writes for high-volume token streaming (bypass React reconciler)
- Zustand for centralized state management
- Flexbox layout via Yoga engine

### 3.2 Tool System

#### 3.2.1 Native Tools (P0)
**File System Operations:**
- `read_file(path: string, line_start?: number, line_end?: number): string`
- `write_file(path: string, content: string)` - Stages to buffer, requires user confirmation
- `list_files(path: string, recursive: boolean, pattern?: string): string[]`
- `grep_search(path: string, pattern: string, file_pattern?: string): SearchResult[]`
- `create_directory(path: string): void`
- `delete_file(path: string)` - Requires explicit confirmation

**Terminal Operations:**
- `execute_command(command: string, cwd?: string): CommandResult`
- `get_environment_variable(name: string): string`

**Git Operations (via MCP Server):**
- `git_status()`, `git_diff()`, `git_commit()`, `git_push()`

#### 3.2.2 MCP Integration (P0)
**Requirement:** Act as MCP host to connect to external tool servers

**Acceptance Criteria:**
- [ ] Discover and connect to MCP servers defined in `mcp_settings.json`
- [ ] Dynamically load tools from connected servers at startup
- [ ] Translate MCP tool definitions to model-specific formats (OpenAI functions, Anthropic tools, Gemini function_declarations)
- [ ] Route tool calls from LLM to correct MCP server and return results
- [ ] Handle connection failures gracefully with user-visible error messages

**Supported MCP Server Types:**
- Web Search: Tavily, Brave Search, Google Search
- Databases: SQLite, PostgreSQL (via MCP servers)
- SaaS: GitHub, Jira, Slack (via MCP servers)
- Cloud: AWS, GCP (via MCP servers)

### 3.3 Context Management

#### 3.3.1 Intelligent Context Loading (P1)
**Requirement:** Optimize context usage based on model capabilities

**Acceptance Criteria:**
- [ ] For Gemini (2M token window): Load entire codebase directly into context
- [ ] For OpenAI/Anthropic (128K-200K): Use hybrid approach (direct injection + RAG fallback)
- [ ] For local models (8K-32K): Always use RAG with vector embeddings
- [ ] Warn user when context usage exceeds 80% of model limit
- [ ] Automatically trigger `/compact` when nearing limit

**Technical Implementation:**
- Token counting using tiktoken (OpenAI), Anthropic tokenizer, Gemini tokenizer
- Local vector database (lancedb or sqlite-vss) for RAG
- `query_context` tool injected for models using RAG mode

#### 3.3.2 Session Persistence (P1)
**Requirement:** Save and restore conversation sessions

**Acceptance Criteria:**
- [ ] Sessions auto-saved to `~/.universal-cli/sessions/` directory
- [ ] Session metadata includes: timestamp, model used, token count, files accessed
- [ ] `/resume` command shows interactive list with preview of last message
- [ ] Sessions exported as JSON for analysis or sharing
- [ ] Maximum 50 sessions retained (oldest auto-deleted)

### 3.4 Security & Privacy

#### 3.4.1 Human-in-the-Loop (HITL) (P0)
**Requirement:** Require user approval for high-risk operations

**Acceptance Criteria:**
- [ ] File writes display diff view before execution (red/green highlighting)
- [ ] Shell commands show full command string before execution
- [ ] Destructive operations (delete, drop database) require explicit typing of "yes"
- [ ] User can configure auto-approval for read-only operations
- [ ] All approved actions logged to audit trail

#### 3.4.2 Credential Management (P0)
**Requirement:** Handle API keys and tokens securely

**Acceptance Criteria:**
- [ ] API keys stored in OS keychain (Keytar on macOS/Linux, Credential Manager on Windows)
- [ ] MCP servers use OAuth where possible (no raw tokens passed to agent)
- [ ] Environment variables containing secrets (AWS_SECRET, DB_PASSWORD) never exposed to agent
- [ ] Warning displayed when `.env` files detected in workspace

#### 3.4.3 Policy Engine (P1)
**Requirement:** Enforce organizational security policies

**Acceptance Criteria:**
- [ ] `.agent-policy.yaml` defines allowed actions: `allow_net`, `allow_exec`, `auto_approve_read`
- [ ] Policy violations trigger user prompt or block action based on configuration
- [ ] Enterprise customers can enforce policy via environment variable override
- [ ] Policy violations logged for compliance auditing

### 3.5 Developer Experience

#### 3.5.1 Configuration Management (P1)
**Requirement:** Flexible configuration via files and environment variables

**Configuration Files:**
- `~/.universal-cli/config.yaml` - Global settings (default model, API keys location)
- `.agentrc` - Project-specific settings (context files, MCP servers)
- `AGENTS.md` - Project instructions read automatically on startup
- `.agent-policy.yaml` - Security policies

**Environment Variables:**
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`
- `UNIVERSAL_CLI_MODEL` - Override default model
- `UNIVERSAL_CLI_SAFE_MODE` - Force safety confirmations

#### 3.5.2 Error Handling & Debugging (P1)
**Requirement:** Provide clear error messages and debug capabilities

**Acceptance Criteria:**
- [ ] LLM errors (rate limit, invalid API key) shown with actionable remediation steps
- [ ] Tool execution failures automatically trigger `/debug` mode
- [ ] Verbose logging mode (`--verbose` flag) outputs all API requests/responses
- [ ] MCP connection failures show server status and suggest fixes

---

## 4. Non-Functional Requirements

### 4.1 Performance
- **Latency:** Command processing <200ms for local operations
- **Streaming:** Token streaming begins within 500ms of query submission
- **Throughput:** Support 100+ tokens/second streaming on standard networks
- **Memory:** CLI resident memory <100MB (excluding model downloads for Ollama)

### 4.2 Scalability
- **Context:** Handle codebases up to 100K files (via RAG indexing)
- **Sessions:** Support 1000+ saved sessions per user
- **Concurrent Tools:** Execute up to 5 MCP tool calls in parallel

### 4.3 Reliability
- **Uptime:** CLI process stable for 24+ hour sessions
- **Crash Recovery:** Auto-save conversation state every 30 seconds
- **Error Recovery:** Retry failed API calls with exponential backoff (max 3 retries)

### 4.4 Security
- **Sandbox Escape:** Zero successful sandbox escapes in penetration testing
- **Dependency Scanning:** All npm dependencies scanned for vulnerabilities (Snyk/npm audit)
- **Audit Logging:** All file modifications and command executions logged with timestamps

### 4.5 Compatibility
- **Operating Systems:** macOS 11+, Linux (Ubuntu 20.04+), Windows 10+ (PowerShell 5.1+)
- **Terminals:** iTerm2, Terminal.app, Windows Terminal, Alacritty, Kitty
- **Node.js:** v18.0.0+ (LTS versions)
- **Models:** OpenAI GPT-4o/4o-mini, Anthropic Claude 3.5 Sonnet/3.7, Google Gemini 1.5/2.0, Ollama (Llama 3, Mistral, Qwen)

### 4.6 Accessibility
- **Screen Readers:** Basic screen reader support for text output
- **Keyboard Navigation:** 100% keyboard-navigable (no mouse required)
- **Color Blindness:** Information conveyed through text + color (not color alone)

---

## 5. Technical Architecture

### 5.1 Technology Stack
**Core:**
- **Language:** TypeScript 5.0+
- **Runtime:** Node.js 18+ LTS
- **Package Manager:** pnpm

**Key Dependencies:**
- **TUI Framework:** React Ink 4.x
- **State Management:** Zustand
- **LLM SDKs:** OpenAI SDK, Anthropic SDK, Google Generative AI SDK
- **MCP:** @modelcontextprotocol/sdk
- **Sandboxing:** isolated-vm (JavaScript), Docker (Python/system)
- **Vector DB:** lancedb (local embeddings)
- **CLI Framework:** Commander.js
- **Testing:** Vitest, Playwright (for TUI testing)

### 5.2 Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│            Presentation Layer (React Ink)            │
│  Components: ChatView, DiffView, ModelSelector,     │
│              FileTree, ProgressBar, ConfirmDialog    │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│         Orchestration Layer (Agent Loop)             │
│  - Command Parser (Slash commands)                   │
│  - Conversation Manager (State + History)            │
│  - Tool Router (Native tools + MCP)                  │
│  - Security Policy Engine                            │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│   Intelligence Layer (UMAL - Model Adapters)         │
│  - OpenAI Adapter  - Anthropic Adapter               │
│  - Gemini Adapter  - Ollama Adapter                  │
│  Common Interface: IModelAdapter                     │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│              Tool Execution Layer                    │
│  Native Tools        │         MCP Client            │
│  - Safe-FS           │         - Tool Discovery      │
│  - Terminal Sandbox  │         - Call Routing        │
│                      │         - Result Handling     │
└─────────────────────────────────────────────────────┘
```

### 5.3 Data Models

#### Conversation Message
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ContentBlock[];
  timestamp: number;
  model?: string;
  tokens?: { input: number; output: number };
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}
```

#### Tool Definition (Universal)
```typescript
interface UniversalToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required: string[];
  };
}
```

#### Session Metadata
```typescript
interface Session {
  id: string;
  created: number;
  lastModified: number;
  model: string;
  tokenCount: { total: number; input: number; output: number };
  filesAccessed: string[];
  messages: Message[];
  contextFiles: string[];
}
```

### 5.4 Security Architecture

**Defense in Depth:**
1. **Input Validation:** Static analysis of generated code before execution
2. **Language Sandbox:** isolated-vm for JavaScript (separate V8 isolate)
3. **OS Sandbox:** Docker containers for Python/system commands
4. **Filesystem Isolation:** Restricted to workspace directory
5. **Network Isolation:** Default no internet, allowlist override
6. **Resource Limits:** Timeout, memory, CPU quotas
7. **Human-in-the-Loop:** User confirmation for destructive operations
8. **Audit Logging:** All operations logged to `~/.universal-cli/audit.log`

---

## 6. User Experience Flows

### 6.1 First-Time Setup Flow
1. User installs via `npm install -g universal-cli`
2. User runs `universal-cli init`
3. Interactive setup prompts for:
   - Default model selection
   - API key configuration (with keychain storage)
   - MCP server discovery (scan for common servers)
4. Creates `~/.universal-cli/config.yaml` and `.agentrc` in current directory
5. Displays welcome tutorial with example commands

### 6.2 Typical Development Session Flow
1. User navigates to project directory
2. User runs `universal-cli` (launches TUI)
3. CLI auto-loads `AGENTS.md` and `.agentrc` context
4. User types: `/add @src` to inject codebase
5. User asks: "refactor the authentication module to use OAuth2"
6. Agent enters `/plan` mode, generates `PLAN.md`
7. User reviews plan, types: `/build`
8. Agent writes code, displays diffs for each file
9. User confirms changes, agent writes to disk
10. User types: `/review` to analyze changes
11. Agent provides critique, user iterates
12. User types: `/exit` to save session

### 6.3 Model Switching Flow
1. User types: `/model`
2. TUI displays interactive list: GPT-4o, Claude 3.5, Gemini 1.5, Llama 3 (local)
3. User selects Gemini 1.5 Pro
4. CLI reconnects with new provider, re-injects context
5. User continues conversation seamlessly

### 6.4 Error Recovery Flow
1. Agent executes code that crashes (syntax error)
2. CLI captures stderr output
3. Automatically triggers `/debug` mode
4. Agent analyzes error, proposes fix
5. User approves, agent retries execution
6. Success - agent continues task

---

## 7. Milestones & Roadmap

### Phase 1: Foundation (Months 1-3)
**Goals:** Core CLI with single model support, basic tools

**Deliverables:**
- [ ] CLI scaffolding with React Ink TUI
- [ ] OpenAI adapter with GPT-4o support
- [ ] Native file system tools (read/write/list)
- [ ] Basic slash commands (/add, /new, /help)
- [ ] Session persistence
- [ ] Test coverage: 70%+

**Success Criteria:**
- Developer can have multi-turn conversations about codebase
- File operations work with user confirmation
- Sessions save and restore correctly

### Phase 2: Multi-Model & MCP (Months 4-6)
**Goals:** Universal model support, MCP integration

**Deliverables:**
- [ ] Anthropic, Gemini, Ollama adapters
- [ ] UMAL interface with adapter pattern
- [ ] MCP client integration
- [ ] Dynamic tool discovery from MCP servers
- [ ] Model switching via `/model` command
- [ ] Comprehensive adapter test suite

**Success Criteria:**
- All 4 model providers work with feature parity
- MCP servers (Tavily, GitHub) connect and function
- Token efficiency gains measured (70%+ reduction vs. baseline)

### Phase 3: Security & Sandboxing (Months 7-9)
**Goals:** Production-grade security architecture

**Deliverables:**
- [ ] isolated-vm integration for JavaScript execution
- [ ] Docker containerization for Python/system commands
- [ ] Policy engine with `.agent-policy.yaml`
- [ ] Human-in-the-loop confirmation flows
- [ ] Audit logging system
- [ ] Security penetration testing

**Success Criteria:**
- Zero sandbox escapes in security audit
- All destructive operations require confirmation
- Audit logs capture all file/command operations

### Phase 4: Advanced Features (Months 10-12)
**Goals:** Polish, optimization, enterprise features

**Deliverables:**
- [ ] RAG-based context management for large codebases
- [ ] Sub-agent orchestration (/plan + /build parallelization)
- [ ] Syntax highlighting and diff view improvements
- [ ] VS Code extension for CLI integration
- [ ] Enterprise SSO/SAML support for API authentication
- [ ] Performance optimization (streaming latency <100ms)

**Success Criteria:**
- Handle 100K+ file codebases efficiently
- Enterprise pilot customers deployed
- Community contributions accepted (open-source)

### Phase 5: GA Release & Ecosystem (Month 12+)
**Goals:** General availability, ecosystem growth

**Deliverables:**
- [ ] Official 1.0 release
- [ ] Comprehensive documentation site
- [ ] MCP server marketplace integration
- [ ] Plugin system for custom commands
- [ ] Telemetry dashboard (opt-in)
- [ ] Community Discord/forums

**Success Criteria:**
- 10,000+ monthly active developers
- 50+ community-contributed MCP servers listed
- 4.5+ star rating on npm/GitHub

---

## 8. Success Metrics & KPIs

### 8.1 Adoption Metrics
- **Downloads:** npm downloads per month
- **Active Users:** Unique CLI invocations per day
- **Retention:** 30-day user retention rate (target: 40%+)
- **Session Length:** Average session duration (target: 30+ minutes)

### 8.2 Performance Metrics
- **Token Efficiency:** Average tokens used per task vs. baseline tool calling (target: 70% reduction)
- **Latency:** P95 time to first token (target: <500ms)
- **Error Rate:** Failed tool executions per session (target: <5%)
- **Sandbox Escapes:** Security incidents per 1M executions (target: 0)

### 8.3 Quality Metrics
- **Code Quality:** Pass rate of generated code on unit tests (target: 85%+)
- **User Satisfaction:** NPS score from monthly survey (target: 50+)
- **Support Tickets:** Average resolution time for issues (target: <24 hours)

### 8.4 Business Metrics
- **Model Cost:** Average API cost per user per month (target: <$10)
- **Conversion:** Free to paid (enterprise) conversion rate (target: 5%+)
- **Revenue:** ARR from enterprise contracts (target: $1M+ Year 1)

---

## 9. Risks & Mitigations

### 9.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Sandbox escape vulnerability | High | Medium | Extensive security testing, bug bounty program, use proven isolation tech (isolated-vm) |
| Model API breaking changes | High | Medium | Adapter versioning, automated API compatibility tests, maintain adapters for multiple API versions |
| Performance degradation with large codebases | Medium | High | Implement RAG early, benchmarking suite, optimize vector search with quantization |
| Incompatible terminals (ANSI support) | Low | Medium | Graceful degradation, ASCII fallback mode, extensive terminal testing matrix |

### 9.2 Market Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Anthropic/OpenAI launch competing free CLI | High | Medium | Differentiate on model agnosticism and open-source community |
| MCP standard fails to gain adoption | Medium | Low | Build value even without MCP (native tools sufficient), contribute to MCP spec |
| User resistance to terminal-based tools | Medium | Low | Target CLI-native developers first, create VS Code bridge for IDE users |

### 9.3 Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| API costs exceed user willingness to pay | High | Medium | Optimize token usage aggressively, offer local model option (free), tiered pricing |
| Enterprise security concerns block adoption | Medium | Medium | Achieve SOC 2 compliance, provide on-premise deployment option, detailed security whitepaper |
| Open-source sustainability | Medium | High | Dual licensing (open-source + commercial), enterprise support contracts, GitHub Sponsors |

---

## 10. Open Questions & Decisions Needed

### 10.1 Product Questions
1. **Monetization Strategy:** Pure open-source vs. open-core with enterprise features?
   - **Options:** (A) Fully open-source, monetize via support contracts; (B) Core CLI free, enterprise features (SSO, audit, org memory) paid
   - **✅ DECISION:** Option A - Fully open-source, monetize via support contracts, consulting, and GitHub Sponsors. This maximizes community adoption and aligns with the "universal" positioning.

2. **Default Model:** What should be the out-of-box default?
   - **Options:** (A) GPT-4o (most capable); (B) GPT-4o-mini (cheapest); (C) User chooses on first run
   - **✅ DECISION:** Option C - User chooses on first run via interactive setup wizard. This respects user budget constraints and API preferences without imposing defaults.

3. **Local Model Experience:** How much should we optimize for local models given quality gap?
   - **Options:** (A) First-class support with prompt engineering; (B) "Experimental" support with warnings
   - **✅ DECISION:** Option A - First-class support with dedicated prompt engineering, JSON repair middleware, and optimized schemas. Privacy-conscious users and air-gapped environments require viable local option.

### 10.2 Technical Questions
1. **Streaming Architecture:** Full buffering vs. incremental rendering?
   - **✅ DECISION:** Incremental rendering. Use React Ink's `useStdout` hook to write high-volume token streams directly to stdout, bypassing React reconciler. React components used only for UI chrome (status bars, prompts) to maintain responsiveness at 100+ tokens/sec.

2. **Vector Database:** Embed in CLI binary vs. require external installation?
   - **Options:** (A) Bundle sqlite-vss in npm package; (B) Require Docker for RAG features
   - **✅ DECISION:** Option A - Bundle sqlite-vss in npm package as native dependency. This eliminates external installation requirements and enables zero-config RAG for large codebases. Docker remains optional for advanced sandboxing only.

3. **MCP Discovery:** Auto-discover servers vs. explicit configuration?
   - **Options:** (A) Scan common paths (~/mcp-servers/\*); (B) Require .agentrc configuration
   - **✅ DECISION:** Hybrid approach - Auto-discover MCP servers in standard paths (`~/.mcp-servers/`, `./mcp-servers/`, system-wide `/usr/local/mcp-servers/`) on startup, with explicit override via `.agentrc` for custom locations. Display discovered servers in `/mcp list` for transparency.

---

## 11. Dependencies & Assumptions

### 11.1 External Dependencies
- **MCP Specification Stability:** Assumes MCP spec reaches 1.0 without breaking changes
- **Model API Availability:** Assumes continued access to OpenAI, Anthropic, Gemini APIs
- **Docker Availability:** Assumes users can install Docker for advanced sandboxing
- **Terminal Capabilities:** Assumes target users have modern terminals with ANSI support

### 11.3 Key Assumptions
- Developers prefer terminal-based tools for coding tasks (validated by Claude Code, Cursor success)
- Model-agnostic approach is valued by users (not just "OpenAI vs. Anthropic" binary choice)
- MCP will become the de facto standard for agent tool protocols (or sufficient alternative exists)
- Token costs will continue to decrease, making agentic workflows economically viable

---

## 12. Appendices

### Appendix A: Competitive Analysis Summary
Detailed feature comparison of Claude Code, Gemini CLI, OpenCode, Factory AI Droid, and legacy Codex CLI. See sections 2.1-2.5 for full analysis.

### Appendix B: Security Threat Model
Comprehensive analysis of attack vectors (prompt injection, sandbox escape, token exfiltration) and mitigations. See section 2 of reference document on security protocols.

### Appendix C: Architectural Decision Records (ADRs)
- **ADR-001:** Why TypeScript over Python for CLI implementation
- **ADR-002:** Why React Ink over blessed for TUI
- **ADR-003:** Why isolated-vm over vm2 for JavaScript sandboxing
- **ADR-004:** Why MCP over custom tool protocol

### Appendix D: Technical Research Bibliography
All 28 cited sources from the two reference documents are catalogued with links for further investigation.

**End of Document**
