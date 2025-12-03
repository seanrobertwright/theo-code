# The Unified Agentic Interface: Architectural Blueprint for a Universal TUI CLI

## 1\. Executive Context: The Terminal as an Intelligence Interface

The Command Line Interface (CLI) has stood as the bedrock of software engineering for over half a century. Defined by the Read-Eval-Print Loop (REPL), it demands explicit, deterministic instructions. A developer must know the exact syntax of tar, awk, or git to manipulate the system. However, the emergence of Large Language Models (LLMs) has precipitated a paradigm shift from imperative interaction-where the user describes _how_ to do something-to intent-based interaction, where the user describes _what_ they want done. This transition is giving rise to the "Agentic CLI," a new class of developer tool that fuses the raw power of the shell with the reasoning capabilities of advanced AI.

The promise of the Agentic CLI is not merely to autocomplete commands but to act as an autonomous orchestrator. Such an agent can plan multi-step refactors, debug complex stack traces by inspecting source code, and manage infrastructure state, all while residing within the developer's native terminal environment. Yet, the current landscape is fragmented. Proprietary silos like Anthropic's **Claude Code**, Google's **Gemini CLI**, and Factory AI's **Droid** offer powerful capabilities but lock users into specific model families and workflows. Conversely, open-source efforts often lack the polish and "vibe coding" fluidity of their commercial counterparts.

This report presents a comprehensive architectural analysis and design specification for a **Universal TUI Agent CLI**. Built on **TypeScript**, this system is designed to be model-agnostic, supporting **Anthropic, OpenAI, Gemini, and local LLMs via Ollama**. It proposes a unified abstraction layer that normalizes the chaotic landscape of API schemas, a standardized system of slash commands derived from deep market research, and a robust implementation of the **Model Context Protocol (MCP)** to ensure that tools remain compatible regardless of the underlying intelligence driving them.

## 2\. Competitive Landscape and Gap Analysis

To design a superior universal agent, one must first deconstruct the current state of the art. The market is currently segmented into distinct philosophies: the "Unix Philosophy" approach, the "Ecosystem Integration" approach, the "Open Source Interpreter" approach, and the "Enterprise Automation" approach. This section analyzes five key players-Claude Code, Gemini CLI, OpenCode, Droid by Factory AI, and the legacy Codex CLI-to distill a best-of-breed feature set.

### 2.1 Claude Code: The Composable Unix Citizen

Anthropic's **Claude Code** has defined the standard for integrating agentic reasoning into the Unix pipeline. Its core philosophy is composability. Unlike monolithic agents that attempt to replace the shell entirely, Claude Code is designed to live _within_ the pipe, respecting the decades-old traditions of standard input and output.

The architectural genius of Claude Code lies in its treatment of the LLM as a text transformation engine that can be chained. Commands like tail -f app.log | claude -p "alert me on error" demonstrate an understanding that the agent is a filter for information streams.<sup>1</sup> This "Unix philosophy" integration allows developers to weave AI into existing bash scripts and CI/CD pipelines without rewriting their infrastructure.

Contextual Grounding Strategy:

Claude Code solves the "blank slate" problem through the CLAUDE.md file. This is a localized context anchor placed in the project root that creates a "stateless but context-aware" architecture.2 Instead of relying on a persistent database that might drift from the codebase's reality, Claude Code re-reads this file on every invocation. This file typically contains:

- **Build & Test Commands:** Instructions on how to verify code changes.
- **Architecture & Style:** Coding standards and architectural patterns specific to the repo.
- **Etiquette:** Branch naming conventions and pull request protocols.<sup>2</sup>

Interaction Paradigm:

The tool is heavily command-driven but supports a "REPL" mode for interactive sessions. It utilizes slash commands like /compact to manage context window exhaustion explicitly and /review to perform diff analysis before committing changes.3 Security is handled through a permission system; the agent cannot execute side effects (like file writes or shell commands) without explicit user confirmation (Y/n), balancing autonomy with safety.1

### 2.2 Gemini CLI: The Context Window Leviathan

Google's **Gemini CLI** leverages the massive context window of the Gemini 1.5/2.0 Pro models (up to 2 million tokens) to fundamentally change how agents perceive codebases. While Claude Code relies on retrieval and summarization, Gemini CLI attempts to ingest entire directory structures into its active memory.

Memory Architecture:

Gemini CLI introduces commands like /directory add and /compress to manage this massive context explicitly.4 The philosophy here is "brute force context." By holding the entire project structure in working memory, Gemini can perform cross-file reasoning that RAG (Retrieval-Augmented Generation) systems often miss due to fragmentation. It also utilizes a GEMINI.md file, similar to Claude, for persistent instructions.4

Ecosystem Integration:

A distinct feature of Gemini CLI is its "Agent Mode" which ties directly into VS Code, effectively bridging the gap between the terminal and the IDE.5 This allows the agent to utilize the IDE's state-open tabs, cursor position, and active breakpoints-as part of its context. Furthermore, Gemini CLI explicitly exposes commands like /mcp and /tools to the user, offering transparency into the agent's capabilities and connection status to external tools.5

### 2.3 OpenCode: The Local Interpreter

**OpenCode** represents the open-source, model-agnostic approach. It is functionally a "code interpreter" that runs in the terminal, emphasizing cost-efficiency, privacy, and local execution.

Decoupled Intelligence:

OpenCode decouples the interface from the intelligence provider. It was one of the first CLIs to integrate Tavily via MCP for web search, acknowledging that an agent without internet access is severely limited in its ability to self-correct.6 This integration transforms the CLI from a mere code generator into a research assistant capable of looking up current documentation.

Architectural Insight:

OpenCode introduces the concept of distinct modes: /plan mode for high-level reasoning and /build mode for execution.7 This separation of concerns allows the user to verify the architectural approach before the agent writes a single line of code, saving tokens and reducing regression risks. It also supports "Bring Your Own Key" (BYOK) and OpenRouter, making it the most adaptable architecture for a universal CLI.6

### 2.4 Droid (Factory AI): The Enterprise Automator

**Factory AI's Droid** moves beyond the "copilot" model to the "virtual employee" model. It is designed for asynchronous, long-running tasks rather than immediate interactive REPL cycles.

Persistent Organizational Memory:

Droid's key differentiation is "Org Memory." Unlike a local CLI that forgets context when the window closes, Droid maintains a persistent graph of decisions, architectural patterns, and team norms that transcends individual sessions.8 This allows a Droid to "remember" a decision made three weeks ago about API versioning standards and apply it to a new task today.

Asynchronous Reliability:

Droids are designed to run in the background (headless mode), capable of waiting for CI/CD pipelines to finish before taking the next step.9 This acknowledges that real-world engineering often involves waiting-waiting for builds, waiting for tests, waiting for deployments. A CLI that must remain open and active is inefficient; Droid's architecture handles "long-running processes" by detaching and re-attaching to tasks.9

Guardrails:

Factory AI implements strict "guardrails" for autonomous execution. These are enterprise-grade policy engines that prevent the agent from executing destructive commands (like DROP DATABASE) without oversight.8

### 2.5 Codex CLI: The Legacy Progenitor

While often conflated with GitHub Copilot, the original **Codex CLI** (and similar early experiments like OpenAI's codex-cli wrapper) established the baseline for natural-language-to-shell translation.

One-Shot Command Translation:

The primary capability of these early tools was translating "list all pdfs sorted by size" into find. -name "\*.pdf" -ls | sort -k 7 -n.10 They lacked the continuous state, context management, and multi-turn reasoning of modern agents. However, they demonstrated the utility of a "Shell Assistant" that acts as a translator for obscure syntax. Our Universal CLI must subsume this capability, offering a /shell or ! passthrough mode that leverages modern models for this specific "translation" task without invoking the full agentic loop.

### 2.6 Comparative Capability Matrix

The following table synthesizes the capabilities, sub-agent structures, and command philosophies of the analyzed tools. This matrix serves as the baseline requirement set for our Universal TUI Agent.

| **Feature / Aspect** | **Claude Code** | **Gemini CLI** | **OpenCode** | **Factory AI (Droid)** | **Proposed Universal CLI** |
| --- | --- | --- | --- | --- | --- |
| **Philosophy** | Unix Pipe / Composable | Context / IDE Companion | Open Source / Interpreter | Enterprise / Asynchronous | **Unified Abstraction** |
| --- | --- | --- | --- | --- | --- |
| **Model Support** | Anthropic (Claude 3.5/3.7) | Google (Gemini 1.5/2.0) | Multi-model (OpenRouter) | Proprietary / Fine-tuned | **All (OpenAI, Anthropic, Gemini, Ollama)** |
| --- | --- | --- | --- | --- | --- |
| **Context Strategy** | CLAUDE.md, Summarization | GEMINI.md, Massive Token Window | Session-based | Org Memory (Shared Graph), DROID.md | **Hybrid (Vector + Graph + .md)** |
| --- | --- | --- | --- | --- | --- |
| **Slash Commands** | /compact, /review, /bug | /chat, /mcp, /memory, /resume | /plan, /build, /ping | Natural Language Triggers | **Standardized ISO-style Command Set** |
| --- | --- | --- | --- | --- | --- |
| **Sub-Agents** | Implicit | Explicit Tools (/tools) | Interpreter Mode | Specialized Droids (Reviewer, PM, Coder) | **Explicit Orchestrator + Specialist Swarm** |
| --- | --- | --- | --- | --- | --- |
| **Tool Protocol** | MCP (Native) | MCP (Supported) | Custom + MCP (Tavily) | Custom Integrations | **MCP First + Native Adapters** |
| --- | --- | --- | --- | --- | --- |
| **Web Search** | Via MCP | Native / Built-in | Via Tavily MCP | Deep Internet Research | **MCP (Google/Brave/Tavily)** |
| --- | --- | --- | --- | --- | --- |
| **Safety** | Permission Prompts (Y/n) | Configuration Files | User-driven | Enterprise Guardrails | **Granular Capabilities (Read/Write/Exec)** |
| --- | --- | --- | --- | --- | --- |
| **Terminal UX** | Direct Shell access | Shell Passthrough (!) | Interpreter Sandbox | Remote/Background Process | **Sandboxed Shell with Pseudo-TTY** |
| --- | --- | --- | --- | --- | --- |

<sup>1</sup>

## 3\. Core Architectural Strategy

To build a CLI that supports the diverse requirements of Anthropic, OpenAI, Gemini, and local LLMs (Ollama), we require a modular architecture that strictly separates the **Presentation Layer (TUI)**, the **Orchestration Layer (Agent Loop)**, and the **Intelligence Layer (Model Adapters)**.

### 3.1 The Foundation: TypeScript & Node.js

TypeScript is the optimal language for this architecture due to the ecosystem's strong support for both AI SDKs (Vercel AI SDK, LangChain, ModelContextProtocol SDK) and robust TUI libraries.

Concurrency & Streaming:

The CLI must handle asynchronous streams effectively. Node.js streams are essential for piping data from the LLM to the TUI without buffering, ensuring a responsive "feel" even when generating long blocks of code. The system will utilize AsyncGenerator patterns to standardize the stream of tokens coming from different providers (OpenAI streams chunks differently than Anthropic), normalizing them into a single internal event format.

### 3.2 The Presentation Layer: Ink vs. Blessed Analysis

Research into TUI libraries indicates a bifurcation between the imperative blessed (C-curses style) and the declarative ink (React-based).<sup>13</sup>

**Blessed (The Legacy Choice):**

- **Pros:** Highly optimized for performance; stable; imperative API is close to the metal.
- **Cons:** No longer actively maintained; complex state management leads to "spaghetti code" in large applications; lacks a component model.

**Ink (The Modern Choice):**

- **Pros:** Uses **React** to render text. This allows us to build reusable UI components (e.g., &lt;Spinner /&gt;, &lt;CodeBlock /&gt;, &lt;ModelSelector /&gt;, &lt;DiffView /&gt;) using familiar React paradigms. This is crucial for managing the complex state of a multi-turn agent conversation.<sup>13</sup>
- **Performance Concerns:** React reconciliation can be overhead-heavy for massive text streams.
- **Optimization Strategy:** To mitigate performance issues, the architecture will utilize Ink's useStdout or useStderr hooks for the high-volume token streaming. Instead of passing every token through the React state (which triggers a re-render of the component tree), we will write the bulk of the LLM's response directly to the standard output stream, bypassing the reconciler. We will use React components only for the "Chrome" (headers, footers, status bars, and input fields) and for interactive elements like menus.<sup>14</sup>

**The Rendering Event Loop:**

- **Input:** Captured via useInput hook (intercepting stdin).
- **State:** A centralized store (Zustand) manages the conversation history, current context files, and tool outputs.
- **Render:** The React Reconciler maps this state to ANSI escape codes via Yoga (the Flexbox engine used by Ink).
- **Output:** Pushed to stdout.

### 3.3 State Management in the Terminal

Unlike a web app, a CLI agent has a linear, append-only nature for history, but a mutable state for context (the list of loaded files).

- **Conversation Store:** An append-only log of Message objects (user, assistant, tool).
- **Context Store:** A set of active file paths and their token counts. This store must trigger a warning when the total token count approaches the limit of the selected model (e.g., 128k for GPT-4o, 2M for Gemini).
- **Tool Store:** Tracks the status of running tools (e.g., "Scanning directory...").

## 4\. The Unified Model Abstraction Layer (UMAL)

The most significant technical challenge identified in the research is the fragmentation of API structures. Each provider handles "tool use" (function calling) differently. The UMAL acts as a strictly typed adapter layer that normalizes these differences, allowing the rest of the application to remain agnostic.

### 4.1 The Fragmentation Problem

- **OpenAI:** Uses a tools array with strict JSON Schema. The response includes a tool_calls array with specific IDs that must be included in the follow-up message.<sup>15</sup>
- **Anthropic:** Uses input_schema within a tool definition. It excels at "Chain of Thought" reasoning before calling tools but requires a different message structure for tool results (specifically tool_use blocks).<sup>16</sup>
- **Gemini:** Uses function_declarations nested within a tools object. The response format embeds functionCall objects within parts, often mixing text and function calls in a single turn.<sup>4</sup>
- **Ollama/Local:** Mimics OpenAI's format but suffers from quantization noise. Smaller models often return malformed JSON, unescaped strings, or "hallucinated" tool calls that don't match the schema.<sup>18</sup>

### 4.2 Adapter Design Pattern

We define a generic IModelAdapter interface in TypeScript:

TypeScript

interface IModelAdapter {  
id: string;  
contextLimit: number;  
/\*\*  
\* Converts the internal UniversalToolDefinition into the provider-specific format.  
\*/  
adaptTools(tools: UniversalToolDefinition): any;  
<br/>/\*\*  
\* Generates a stream of events (TextDelta or ToolCall) from the messages.  
\*/  
generateStream(  
messages: UniversalMessage,  
tools: ToolDefinition,  
config: ModelConfig  
): AsyncGenerator&lt;StreamEvent&gt;;  
}  

The OpenAI Adapter:

This adapter maps UniversalToolDefinition directly to OpenAI's JSON Schema. It handles the accumulation of streamed tool arguments (which arrive in chunks) and reconstructs the full JSON object before emitting a ToolCall event.

The Anthropic Adapter:

This adapter converts tools to Anthropic's specific schema. Crucially, it manages the content block structure. When the model outputs text (reasoning) followed by a tool use, the adapter buffers the tool_use block until it is complete, while streaming the text block immediately to the user.

The Gemini Adapter:

Gemini's function_declarations are Protobuf-based. The adapter must map JSON Schema types to Google's type system. It also handles the safety_settings unique to Gemini to prevent the model from refusing code generation based on false-positive safety triggers.

### 4.3 The "Local Challenge": Ollama & Quantization

Research suggests that local models (e.g., Llama 3 8B, Mistral 7B) often struggle with complex tool schemas.<sup>20</sup> The Ollama adapter requires a unique component: the **Sanitization Middleware**.

JSON Repair Logic:

When a local model returns a tool call, it might look like this:

"tool_call": { name: "readFile", args: "{ 'path': 'file.txt' }" }

The JSON standard requires double quotes, but quantized models often default to single quotes or trailing commas. The middleware intercepts the raw string response and uses a robust parser (like json5 or a custom heuristic repair function) to fix the syntax errors before attempting to parse it.

Prompt Downgrading:

Complex "Chain of Thought" system prompts that work for Claude 3.5 Sonnet may confuse a smaller local model. The UMAL detects if the active model is "local" (via Ollama) and automatically simplifies the system prompt, removing complex reasoning constraints in favor of direct instruction, ensuring the model focuses on the tool call itself.

### 4.4 Token Engineering & Context Management

The Universal CLI must bridge the gap between Gemini's massive context and the limited context of local models.

Strategy: RAG-on-the-Fly

When the user executes /add @dir, the CLI checks the current model's context limit.

- **For Gemini:** It loads all files directly into the context window.
- **For Local/OpenAI:** If the token count exceeds the limit, the CLI switches to "Index Mode." It chunks the files and creates local vector embeddings (using a lightweight ONNX runtime or sqlite-vss in Node.js). Instead of injecting the file content, it injects a query_context tool into the system prompt. The model then learns it can "search" the directory using this tool, effectively giving it infinite _virtual_ context through retrieval.<sup>22</sup>

## 5\. The Standardized Slash Command Protocol (SSCP)

To create a cohesive user experience across disparate models, we define a **Standard Command Set (SCS)**. These commands are "meta-instructions" handled by the orchestration layer, creating a unified grammar for the Agentic CLI.

### 5.1 Philosophy of Interaction

The command system is hierarchical:

- **Session:** Managing the lifecycle.
- **Context:** Managing the memory.
- **Action:** Triggering workflows.
- **Meta:** Configuring the agent.

### 5.2 Session & Context Management Commands

These commands manipulate what the LLM "sees," replacing the manual copy-pasting of file contents.

| **Command** | **Arguments** | **Description** | **Standardization Logic** |
| --- | --- | --- | --- |
| **/new** | None | Clears context, archives session, starts fresh. | Equivalent to OpenCode /new.<sup>12</sup> |
| --- | --- | --- | --- |
| **/resume** | \[id\] | Opens interactive list of past sessions to load. | Unifies Gemini /resume & Claude history.<sup>4</sup> |
| --- | --- | --- | --- |
| **/add** | @file, @dir | Injects content. Supports globbing (src/\*\*/\*.ts). | Uses @ syntax from Gemini/Factory AI. |
| --- | --- | --- | --- |
| **/drop** | @file | Removes file from active context. | Critical for token management. |
| --- | --- | --- | --- |
| **/map** | \[depth\] | Generates ASCII tree of directory. | Replaces expensive ls -R context.<sup>1</sup> |
| --- | --- | --- | --- |
| **/compact** | None | Summarizes history to free up tokens. | Adopted from Gemini /compress.<sup>4</sup> |
| --- | --- | --- | --- |
| **/ignore** | @file | Adds file to session blacklist (like.gitignore). | Prevents accidental reading of secrets. |
| --- | --- | --- | --- |

### 5.3 Execution & Action Commands

These commands trigger specific sub-agent behaviors or complex workflows.

| **Command** | **Description** | **Sub-Agent / Prompt Strategy** |
| --- | --- | --- |
| **/chat** | Standard REPL mode. | Default System Prompt. |
| --- | --- | --- |
| **/plan** | **Architect Mode:** Generates PLAN.md without code. | Prompt: "You are a Senior Architect. Do not write implementation code." High Temperature. |
| --- | --- | --- |
| **/build** | **Builder Mode:** Executes PLAN.md. | Prompt: "You are a Builder. Follow the plan strictly." Low Temperature. |
| --- | --- | --- |
| **/review** | **Auditor Mode:** Analyzes git diff. | Prompt: "Review these changes for security, bugs, and style. Be critical." |
| --- | --- | --- |
| **/debug** | **Fixer Mode:** Analyzes last stderr. | Ingests last error output automatically.<sup>11</sup> |
| --- | --- | --- |
| **/shell** | **Passthrough Mode:** Raw shell execution. | Acts as the legacy Codex/Copilot CLI translator.<sup>10</sup> |
| --- | --- | --- |

### 5.4 Configuration & Meta Commands

| **Command** | **Description** | **Implementation** |
| --- | --- | --- |
| **/model** | Switch provider (e.g., gpt-4o -> llama3). | TUI SelectInput component. Hot-swaps the Adapter. |
| --- | --- | --- |
| **/mcp** | Manage MCP servers (List/Add/Remove). | Interfaces with MCP SDK Client.<sup>5</sup> |
| --- | --- | --- |
| **/config** | Edit .agentrc or environment variables. | TUI Form component. |
| --- | --- | --- |
| **/help** | Context-sensitive help. | Displays command usage and active tools. |
| --- | --- | --- |

## 6\. Universal Tooling & The Model Context Protocol (MCP)

Research confirms that **MCP** is the emerging standard for interoperability.<sup>24</sup> Rather than building custom web search or file system tools for each model, the Universal CLI functions as an **MCP Host**.

### 6.1 MCP as the Interoperability Standard

The Universal CLI implements an MCP Client using the @modelcontextprotocol/sdk.<sup>26</sup>

- **Discovery:** On startup, the CLI reads mcp_settings.json to identify enabled servers (e.g., a local SQLite database, a Google Drive connector, or a Brave Search server).
- **Connection:** It establishes connections (via Stdio or SSE) to these servers.
- **Aggregation:** The capabilities of all connected MCP servers are aggregated into a single list of tools. The UMAL then translates this list into the specific JSON/Protobuf format required by the active LLM. This means a local Llama 3 model can suddenly access a PostgreSQL database via MCP, a capability it wouldn't have natively.

### 6.2 Implementing the MCP Client in TypeScript

The integration leverages the Client class from the SDK.

TypeScript

// Conceptual Implementation of MCP Integration  
import { Client } from "@modelcontextprotocol/sdk/client/index.js";  
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";  
<br/>async function connectToMCPServer(command: string, args: string) {  
const transport = new StdioClientTransport({ command, args });  
const client = new Client({ name: "UniversalCLI", version: "1.0.0" });  
await client.connect(transport);  
<br/>// Dynamic Tool Discovery  
const availableTools = await client.listTools();  
return { client, tools: availableTools };  
}  
<br/>// Tool Execution Wrapper  
async function executeMCPTool(client: Client, toolName: string, args: any) {  
const result = await client.callTool({  
name: toolName,  
arguments: args  
});  
return result.content.text;  
}  

This code demonstrates how the CLI acts as a bridge. The LLM simply outputs a tool call; the CLI routes it to the correct MCP client, executes it, and returns the result.<sup>27</sup>

### 6.3 Designing Native Tools: Safe-FS & Terminal Sandbox

While MCP handles external tools, the CLI must provide **Native Tools** for core functionality. These are strictly typed and controlled within the CLI's codebase.

**1\. Safe-FS (File System):**

- read_file: Reads content (with size limit checks).
- write_file: **Critical Security Point.** Instead of writing directly to disk, this tool writes to a "Staging Buffer." The TUI then displays a Diff View (Red/Green lines). The user must press "Confirm" to flush the buffer to disk. This implements the "Human-in-the-Loop" safety required for trust.<sup>1</sup>
- list_files: Supports recursive listing and ignoring hidden files.
- grep_search: Uses ripgrep for fast content searching.

**2\. Terminal Sandbox:**

- execute_command: Allows the agent to run shell commands.
- **Safety Policy:** A strict "Deny List" blocks commands like rm -rf, sudo, mkfs, or generic piping to /dev/null unless the user explicitly disables "Safe Mode." All commands are presented to the user for confirmation before execution.

### 6.4 Security Guardrails & Human-in-the-Loop

Drawing from Factory AI's Droid, the Universal CLI implements a "Guardrails Engine."

- **Policy File:** A .agent-policy.yaml file defines allowed actions.
  - allow_net: boolean (Can the agent access the internet?)
  - allow_exec: boolean (Can the agent run shell commands?)
  - auto_approve_read: boolean (Can the agent read files without asking?)
- **Mechanism:** Before the Orchestration Layer executes _any_ tool, it checks the Policy. If the action is restricted, it triggers a UI prompt: _"The agent wants to execute npm install. Allow? \[y/N/always\]"_.

## 7\. Future Trajectory & Implementation Roadmap

The proposed architecture provides a robust foundation for a universal agent. However, the field is evolving rapidly. Future iterations should focus on:

- **Multi-Modal TUI:** As models like Gemini 1.5 Pro support image input natively, the TUI should support drag-and-drop of images (rendering them via SIXEL or iTerm protocols) to allow the agent to "see" UI mockups or error screenshots.
- **Collaborative "Org Memory":** Implementing a local vector database (like lancedb) that syncs across the development team's machines, effectively replicating Droid's "Org Memory" without the proprietary cloud lock-in.
- **Sub-Agent Swarms:** Expanding the /plan command to spawn multiple "sub-agents" (processes) that work on different files in parallel, coordinated by a central "Manager Agent," mimicking the Factory AI architecture on a local machine.<sup>9</sup>

By strictly adhering to the **Unified Model Abstraction Layer**, utilizing **Ink** for a rich component-based UI, and adopting **MCP** as the universal glue for tooling, this CLI will not only match the capabilities of current proprietary tools but exceed them in flexibility, privacy, and developer control.

#### Works cited

- Claude Code overview - Claude Code Docs, accessed December 1, 2025, <https://code.claude.com/docs/en/overview>
- Claude Code: Best practices for agentic coding - Anthropic, accessed December 1, 2025, <https://www.anthropic.com/engineering/claude-code-best-practices>
- Slash commands - Claude Code Docs, accessed December 1, 2025, <https://code.claude.com/docs/en/slash-commands>
- CLI Commands | Gemini CLI, accessed December 1, 2025, <https://geminicli.com/docs/cli/commands/>
- Use the Gemini Code Assist agent mode - Google for Developers, accessed December 1, 2025, <https://developers.google.com/gemini-code-assist/docs/use-agentic-chat-pair-programmer>
- Why I Ditched ChatGPT and Cursor for OpenCode: A Smarter, Cheaper Way to Build AI Agents - DEV Community, accessed December 1, 2025, <https://dev.to/karthidreamr/why-i-ditched-chatgpt-and-claude-for-opencode-a-smarter-cheaper-way-to-build-ai-agents-2a5h>
- OpenCode MCP Tool | MCP Servers - LobeHub, accessed December 1, 2025, <https://lobehub.com/mcp/frap129-opencode-mcp-tool>
- Factory is GA: Droids for the Entire SDLC, accessed December 1, 2025, <https://factory.ai/news/factory-is-ga>
- Droid: The #1 Software Development Agent on Terminal-Bench - Factory.ai, accessed December 1, 2025, <https://factory.ai/news/terminal-bench>
- eltociear/awesome-AI-driven-development - GitHub, accessed December 1, 2025, <https://github.com/eltociear/awesome-AI-driven-development>
- Factory.ai: A Guide To Building A Software Development Droid Army - Sid Bharath, accessed December 1, 2025, <https://www.siddharthbharath.com/factory-ai-guide/>
- TUI - OpenCode, accessed December 1, 2025, <https://opencode.ai/docs/tui/>
- ink vs blessed | Terminal User Interface (TUI) Libraries Comparison - NPM Compare, accessed December 1, 2025, <https://npm-compare.com/blessed,ink>
- vadimdemedes/ink: React for interactive command-line apps - GitHub, accessed December 1, 2025, <https://github.com/vadimdemedes/ink>
- Function calling - OpenAI API, accessed December 1, 2025, <https://platform.openai.com/docs/guides/function-calling>
- Tool use with Claude, accessed December 1, 2025, <https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview>
- OpenAI API vs Anthropic API vs Gemini API: A practical guide for businesses in 2025, accessed December 1, 2025, <https://www.eesel.ai/blog/openai-api-vs-anthropic-api-vs-gemini-api>
- Which AI model is most reliable for Tool/Function Calling in n8n? (OpenAI vs. Gemini), accessed December 1, 2025, <https://www.reddit.com/r/n8n/comments/1n7zdz2/which_ai_model_is_most_reliable_for_toolfunction/>
- Ollama tool calling | IBM, accessed December 1, 2025, <https://www.ibm.com/think/tutorials/local-tool-calling-ollama-granite>
- Ollama Tool Calling - Medium, accessed December 1, 2025, <https://medium.com/@danushidk507/ollama-tool-calling-8e399b2a17a8>
- Structured outputs with Ollama, a complete guide w - Instructor, accessed December 1, 2025, <https://python.useinstructor.com/integrations/ollama/>
- Testing AI coding agents (2025): Cursor vs. Claude, OpenAI, and Gemini | Render Blog, accessed December 1, 2025, <https://render.com/blog/ai-coding-agents-benchmark>
- microsoft/graphrag: A modular graph-based Retrieval-Augmented Generation (RAG) system, accessed December 1, 2025, <https://github.com/microsoft/graphrag>
- Specification - Model Context Protocol, accessed December 1, 2025, <https://modelcontextprotocol.io/specification/2025-11-25>
- Model Context Protocol (MCP). MCP is an open protocol that… | by Aserdargun | Nov, 2025, accessed December 1, 2025, <https://medium.com/@aserdargun/model-context-protocol-mcp-e453b47cf254>
- The official TypeScript SDK for Model Context Protocol servers and clients - GitHub, accessed December 1, 2025, <https://github.com/modelcontextprotocol/typescript-sdk>
- A quick look at MCP with large language models and Node.js | Red Hat Developer, accessed December 1, 2025, <https://developers.redhat.com/blog/2025/01/22/quick-look-mcp-large-language-models-and-nodejs>
- Tiny Agents: an MCP-powered agent in 50 lines of code - Hugging Face, accessed December 1, 2025, <https://huggingface.co/blog/tiny-agents>