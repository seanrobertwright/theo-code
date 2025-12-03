# Implementation Guide: Universal TUI Agent CLI

## Quick Start Recommendation

**Start with Phase 1 Foundation, build vertically (not horizontally) to validate architecture early.**

---

## Week 1-2: Initial Development Priority

### Day 1-3: Project Setup & Architecture Skeleton
**Goal:** Establish foundational structure and interfaces

**Tasks:**
- Initialize TypeScript project with strict configuration
- Set up pnpm workspace with proper module structure
- Create core layer interfaces:
  - `IModelAdapter` - Universal model abstraction
  - `UniversalMessage` - Normalized message format
  - `ToolDefinition` - Universal tool schema
- Establish testing framework (Vitest)
- Write first unit tests for type contracts

**Deliverable:** Clean architecture with testable interfaces

---

### Day 4-7: Basic React Ink TUI
**Goal:** Prove the UI layer works with incremental rendering

**Tasks:**
- Build minimal TUI with React Ink (render "Hello World")
- Implement input handling using `useInput` hook
- Create core components:
  - `<ChatView />` - Main conversation container
  - `<MessageList />` - Scrollable message history
  - `<InputPrompt />` - User input field with cursor
- Test incremental rendering with mock token streams
- Validate `useStdout` hook for high-throughput streaming

**Deliverable:** Interactive terminal interface that accepts input and displays streamed responses

---

### Day 8-14: OpenAI Adapter (MVP)
**Goal:** Complete first end-to-end user flow

**Tasks:**
- Implement `OpenAIAdapter` class conforming to `IModelAdapter`
- Handle streaming responses via `AsyncGenerator<StreamEvent>`
- Implement basic tool calling support:
  - `read_file(path: string): string`
  - `write_file(path: string, content: string): void`
- Integration test: User question → OpenAI API → TUI display
- Token counting and context limit warnings

**Deliverable:** Working CLI that can answer questions using GPT-4o

---

## Week 2 Success Milestone

By end of Week 2, you should be able to run:

```bash
npm start

> /add @README.md
✓ Added README.md to context (245 tokens)

> "Summarize this file in 3 bullet points"
[Agent streams response from GPT-4o in real-time]
• This project is a universal TUI agent CLI
• Supports multiple LLM providers (OpenAI, Anthropic, Gemini, Ollama)
• Built with TypeScript and React Ink

> /exit
✓ Session saved to ~/.universal-cli/sessions/2025-12-03-001.json
```

**Validation:** This proves:
- ✅ Ink TUI works with streaming
- ✅ OpenAI adapter correctly implements interface
- ✅ Tool system can read files
- ✅ Session persistence works
- ✅ Architecture is scalable

---

## Implementation Philosophy

### Build Vertically First
- ✅ **DO:** Complete one full stack slice (TUI → Adapter → API → Tool)
- ❌ **DON'T:** Build all 4 model adapters before testing one
- **Rationale:** Discover integration issues early when they're cheap to fix

### Defer Complexity
- ✅ **DO:** Start with native file tools (simple, local)
- ❌ **DON'T:** Start with MCP integration (complex, external dependencies)
- **Rationale:** Prove core architecture before adding abstractions

### Test Incrementally
- ✅ **DO:** Write integration tests for each vertical slice
- ❌ **DON'T:** Write comprehensive test suite before code exists
- **Rationale:** Tests should validate behavior, not lock in premature APIs

---

## What NOT to Build Yet

| ❌ Avoid | Why | When to Build |
|---------|-----|---------------|
| All 4 model adapters in parallel | You'll duplicate the same bugs 4 times | After OpenAI adapter is stable (Week 3-4) |
| Security sandboxing (isolated-vm/Docker) | Premature - no code to execute yet | Phase 3 (Months 7-9) when executing agent-generated code |
| MCP client integration | Adds complexity before native tools work | Phase 2 (Months 4-6) after adapter pattern proven |
| Comprehensive documentation | API will change, docs will become stale | Phase 5 (Month 12+) once API is stable |
| Slash command system | Need basic chat working first | Week 3-4 after MVP conversation loop works |
| Session persistence UI | Can manually save/load for now | Week 3 after core functionality proven |

---

## Next Steps After Week 2 MVP

### Week 3-4: Hardening & Command System
1. Implement slash command parser (`/add`, `/new`, `/help`)
2. Add file tree visualization for `/map` command
3. Improve TUI components (syntax highlighting, progress spinners)
4. Write comprehensive tests for OpenAI adapter edge cases

### Week 5-6: Second Model Adapter
1. Implement Anthropic adapter (validates abstraction layer)
2. Test model switching (`/model` command)
3. Compare behavior differences between providers
4. Refine `IModelAdapter` interface based on learnings

### Week 7-8: Tool System Expansion
1. Add Git tools (`git_status`, `git_diff`, `git_commit`)
2. Implement terminal execution (`execute_command`)
3. Add human-in-the-loop confirmations for write operations
4. Build diff viewer component for file changes

---

## Critical Architectural Decisions (Applied)

Based on PRD Section 10 decisions:

### Product Decisions
- **Monetization:** Fully open-source (MIT license), monetize via consulting/support
- **Default Model:** Interactive setup wizard on first run (user chooses)
- **Local Models:** First-class support with dedicated prompt engineering for Ollama

### Technical Decisions
- **Streaming:** Incremental rendering using `useStdout` for token streams
- **Vector DB:** Bundle sqlite-vss in npm package (no external dependencies)
- **MCP Discovery:** Hybrid auto-discovery + manual `.agentrc` override

---

## Development Environment Setup

### Prerequisites
```bash
# Required
node >= 18.0.0 (LTS)
pnpm >= 8.0.0

# Optional (for future phases)
docker >= 20.0.0
```

### Initial Scaffolding
```bash
# Create project structure
mkdir -p universal-cli/{src/{adapters,components,tools,types},tests}

# Initialize
pnpm init
pnpm add -D typescript @types/node vitest
pnpm add ink react zod commander

# First files to create
touch src/types/model.ts        # IModelAdapter interface
touch src/types/message.ts      # UniversalMessage types
touch src/types/tool.ts         # ToolDefinition types
touch src/adapters/openai.ts    # OpenAIAdapter implementation
touch src/components/ChatView.tsx  # Main TUI component
touch src/index.tsx             # Entry point
```

---

## Testing Strategy (Phase 1)

### Unit Tests (Vitest)
- Type contract validation (interfaces compile correctly)
- Message format transformations (OpenAI → Universal)
- Token counting accuracy

### Integration Tests
- OpenAI API connection (with test API key)
- Stream handling (mock 100 tokens/sec)
- Tool execution (read_file returns correct content)

### Manual Validation
- TUI rendering in different terminals (iTerm2, Windows Terminal)
- Streaming performance (no lag or flickering)
- Keyboard navigation (arrow keys, Ctrl+C gracefully exits)

---

## Risk Mitigation (Phase 1)

| Risk | Mitigation |
|------|------------|
| React Ink performance issues with streaming | Test with 100+ tokens/sec mock early; implement `useStdout` bypass if needed |
| OpenAI API rate limits during development | Use tiered retry logic; cache responses in tests |
| TypeScript interface changes break code | Use Zod for runtime validation; write schema tests |
| Terminal compatibility issues | Test on macOS, Linux, Windows from Day 1 |

---

## Success Metrics (Week 2)

- [ ] User can install CLI globally via `pnpm install -g`
- [ ] User can ask question and receive streamed response
- [ ] User can add file to context via `/add @file`
- [ ] File operations work with confirmation prompts
- [ ] Session auto-saves on `/exit`
- [ ] Zero crashes during 30-minute test session
- [ ] Streaming renders smoothly at 50+ tokens/sec
- [ ] Test coverage >70% for core interfaces

---

## Resources

**PRD Reference:** `PRD.md` Section 7 (Milestones & Roadmap)  
**Architecture:** `PRD.md` Section 5 (Technical Architecture)  
**Tech Stack:** `PRD.md` Section 5.1 (Technology Stack)

---

**Next Review Point:** End of Week 2 - Validate MVP works before proceeding to Phase 1 remaining tasks
