# The Convergence of Agentic Architectures: Code Execution, Security Protocols, and Programmatic Optimization in TypeScript

## Executive Summary

The domain of artificial intelligence engineering is currently navigating a profound architectural transition, moving from stateless, conversational interfaces toward persistent, autonomous agents capable of complex reasoning and environmental manipulation. This shift is not merely an incremental improvement in model capability but a fundamental restructuring of the underlying software scaffolding that supports Large Language Models (LLMs). As developers seek to integrate these agents into production environments-specifically within the TypeScript ecosystem-three critical vectors of innovation have emerged as the pillars of the next-generation agentic stack: the Model Context Protocol (MCP) with a paradigm shift toward Code Execution; robust, multi-layered security frameworks designed to mitigate the risks of autonomous computation; and the translation of DSPy (Demonstrate-Search-Predict) principles into TypeScript to enable self-optimizing, type-safe workflows.

This report provides an exhaustive technical analysis of these three vectors, synthesizing research from Anthropic's engineering teams, open-source security audits, and the emerging TypeScript AI ecosystem. First, it examines the severe architectural limitations of traditional JSON-based tool calling-specifically the "context saturation" and latency cascades that plague current implementations-and validates Anthropic's "Code Execution" paradigm as a necessary evolution.<sup>1</sup> By treating tools as libraries importable within a sandboxed runtime rather than static JSON schemas, developers can reduce token consumption by orders of magnitude while enabling complex, multi-step reasoning loops.

Second, the report addresses the critical security implications of this shift. As agents evolve from passive text generators to active code executors, the attack surface expands dramatically. We analyze the deprecation of vm2 due to critical sandbox escape vulnerabilities and the industry's pivot toward V8 isolate-based solutions like isolated-vm and ephemeral containerization strategies involving Docker.<sup>3</sup> The analysis extends to MCP-specific security concerns, such as the "keys to the kingdom" vulnerability regarding authentication tokens, proposing a zero-trust architecture for MCP server deployment.<sup>6</sup>

Third, we evaluate the maturation of the TypeScript AI ecosystem, specifically the emergence of frameworks like ax-llm that bring the programmatic prompt optimization and "signature-based" development of Stanford's DSPy to JavaScript environments. This allows TypeScript developers to build agents that mathematically optimize their own instructions, moving prompt engineering from a heuristic art to an empirical science.<sup>8</sup> Finally, the report synthesizes these elements into a blueprint for the "Modern Agentic CLI," combining React-based TUI libraries (Ink) with standardized slash-command interfaces to create the "Thick Client" developer tools of the future.<sup>10</sup>

## 1\. The Architectural Shift: From Tool Definitions to Code Execution

The foundational promise of the "Agentic Era" is the ability of AI models to interact with the world-to read files, query databases, and execute commands. The Model Context Protocol (MCP) was introduced to standardize these connections, providing a universal language for agents to discover and utilize external capabilities. However, as the ambition of agentic workflows has scaled, the limitations of the initial implementation-relying on JSON-RPC based function calling-have become glaringly apparent.

### 1.1 The Context Saturation Crisis

In the traditional "Tool Use" paradigm (often referred to as function calling in the OpenAI ecosystem), the application developer defines a set of capabilities using JSON schemas. These schemas must be injected into the LLM's context window (specifically the system prompt) at the start of every session so the model is aware of what actions it can take. While functional for simple applications with a handful of tools, this architecture suffers from a phenomenon known as "Context Window Saturation" when applied to enterprise-grade agents.

Research from Anthropic's engineering teams highlights that loading hundreds of tool definitions upfront can consume tens of thousands of tokens before the user has even asked a single question.<sup>1</sup> This creates a high "fixed cost" for every interaction, both financially and computationally. As the number of connected systems grows-integrating GitHub, Jira, Salesforce, Slack, and local filesystems-the sheer volume of schema definitions can overwhelm the model's attention mechanism. This "definition tax" forces developers into a difficult trade-off: restrict the agent's capabilities to save tokens, or provide a rich toolset and accept that a significant portion of the context window is wasted on static definitions rather than dynamic reasoning.

Furthermore, this saturation leads to "distractor overload." As the list of available tools grows into the hundreds, the model's ability to select the correct tool degrades. It becomes statistically more likely to hallucinate a parameter or select a tool with a semantically similar name but incorrect functionality. The result is a fragile system where adding a new capability paradoxically reduces the reliability of existing ones.

### 1.2 The Latency Cascade of the "Reason-Act" Loop

Beyond context consumption, the traditional tool-calling architecture imposes a rigid "stop-and-go" traffic pattern on agent cognition. This is often described as the "Reason-Act" loop. For an agent to filter a dataset and then act on the result, it must engage in a multi-turn conversation with the host application.

Consider a scenario where an agent needs to find active users in a database and calculate their average spend. In a standard tool-calling architecture, the workflow proceeds as follows:

- **Reasoning:** The model decides it needs data.
- **Tool Call:** The model outputs a JSON object: { "tool": "get_users" }.
- **Halt:** The model stops generating.
- **Execution:** The host application receives the JSON, queries the database, and serializes the result.
- **Context Injection:** The host pastes the result (potentially megabytes of JSON) back into the context window.
- **Reasoning:** The model reads the data.
- **Tool Call:** The model outputs a second tool call: { "tool": "calculate_average", "data": \[...\] }.
- **Halt:** The model stops generating again.
- **Execution:** The host runs the calculation.
- **Result:** The host returns the answer.

This "ping-pong" effect introduces significant network latency and inference costs. Each step requires a full round-trip to the model provider, and the intermediate data-often verbose and redundant-must be tokenized, processed, and billed. Anthropic's analysis suggests that for complex tasks, this alternating pattern of inference and execution acts as a severe bottleneck, slowing down agents and increasing the "time to first useful token" for the user.<sup>1</sup>

### 1.3 The Code Execution Paradigm

To resolve these structural inefficiencies, Anthropic and other leaders in the field are advocating for a radical shift: **Code Execution as the primary interface for tool use**.<sup>1</sup> Instead of exposing discrete, granular functions (e.g., add_numbers, filter_list, sort_data) via JSON schemas, the agent is provided with a general-purpose code execution environment (typically Python or JavaScript) and a set of importable libraries.

In this paradigm, the "Tool" is no longer a specific function but a capability to write and run software. The agent is instructed via its system prompt that it has access to a sandboxed runtime (e.g., a Jupyter kernel or a Node.js REPL). When faced with a complex task, rather than selecting a pre-defined tool, the agent writes a script.

#### 1.3.1 Mechanism of Action: The Agent Loop

The transition to code execution simplifies the interaction model significantly. When the agent determines a need for computation or data retrieval, it generates a block of code. The MCP client-acting as the orchestrator-intercepts this block, executes it within a secure sandbox, and returns the standard output (stdout) and standard error (stderr) to the model.

This allows for what Anthropic describes as "more powerful and context-efficient control flow".<sup>1</sup> The agent can execute complex logic, such as loops, conditionals, and data transformations, in a single step. Rather than asking the host to filter a list (one tool call) and then sort it (a second tool call), the agent writes a Python script that does both using the pandas library.

**Comparative Analysis of Workflow Efficiency:**

| **Feature** | **Traditional JSON-RPC Tool Use** | **MCP Code Execution** |
| --- | --- | --- |
| **Interface** | Discrete, pre-defined functions | General-purpose programming language |
| --- | --- | --- |
| **Payload** | Structured Arguments ({ "id": 123 }) | Source Code (source code string) |
| --- | --- | --- |
| **Data Handling** | Intermediate data flows through the LLM | Intermediate data stays in the runtime (RAM) |
| --- | --- | --- |
| **Latency** | High (Multiple round-trips) | **Low** (Single inference + local execution) |
| --- | --- | --- |
| **State** | Stateless (usually) | **Stateful** (Variables persist between cells) |
| --- | --- | --- |

#### 1.3.2 Token Efficiency and Data Privacy

The most dramatic benefit of code execution is the reduction in token usage. In the traditional model, if an agent queries a database for 10,000 rows of data to find an average, all 10,000 rows must be serialized into text and passed into the LLM's context window. This is expensive and slow.

With code execution, the agent writes a script to query the database and calculate the average _within the sandbox_. The only information that enters the LLM's context is the code (a few tokens) and the final result (a single number). The 10,000 rows of data remain in the sandbox's memory, never touching the model provider's servers. This architecture not only reduces costs but also enhances privacy, as sensitive raw data (PII) can be processed locally without ever leaving the organization's secure perimeter.<sup>1</sup>

#### 1.3.3 Deterministic Accuracy

Large Language Models are probabilistic engines; they are fundamentally "guessing" the next token. This makes them notoriously poor at precise tasks like arithmetic, complex logic, or exact string manipulation. By offloading these tasks to a deterministic runtime (like a Python interpreter), the agent achieves 100% accuracy on calculation tasks. The LLM is responsible for _logic generation_ (writing the code), while the runtime is responsible for _logic execution_.<sup>2</sup>

## 2\. Security Architectures for Autonomous Code Execution

The adoption of code execution transforms the AI agent from a passive advisor into an entity capable of arbitrary computation. While this unlocks immense power, it also introduces significant security risks. If an agent can write code, it can theoretically delete files, exfiltrate environment variables, scan local networks, or launch denial-of-service attacks. Therefore, a robust "Defense in Depth" security model is not optional-it is a prerequisite for deployment.

### 2.1 The "Keys to the Kingdom" Vulnerability

MCP servers effectively act as a gateway to an enterprise's most sensitive data. They hold authentication tokens for databases, cloud providers (AWS, GCP), and SaaS tools (Slack, Jira). Research by Check Point and other security analysts highlights that a compromised MCP server represents a single point of failure-a "Keys to the Kingdom" vulnerability.<sup>6</sup>

If an attacker can inject a prompt that convinces the agent to execute code dumping process.env or inspecting the file system where the MCP server is running, they gain access to every system the agent interacts with. This risk is exacerbated by a common anti-pattern identified in early MCP implementations: **Token Passthrough**.

In a Token Passthrough scenario, the client (the agent interface) passes raw authentication tokens to the MCP server. The MCP specification explicitly advises against this. Instead, servers should manage their own authentication and expose high-level capabilities, ensuring the agent never sees or handles the raw credential.<sup>7</sup> A secure architecture requires that the MCP server acts as a privileged proxy, validating the agent's intent before using its stored credentials to act on the agent's behalf.

### 2.2 Sandboxing Technologies: A Comparative Analysis

To safely execute agent-generated code, the runtime must be strictly isolated from the host operating system. The industry has converged on several patterns for Node.js and TypeScript environments, ranging from language-level isolation to full virtualization.

#### 2.2.1 The Fall of vm2 and the Rise of isolated-vm

For Node.js-based agents (a common choice for TypeScript CLI tools), the history of sandboxing provides a stark warning regarding the difficulty of securing dynamic languages.

- **The vm2 Case Study:** For years, vm2 was the standard library for running untrusted JavaScript code in Node.js. It relied on JavaScript Proxy objects to intercept and sanitize calls between the sandbox and the host. However, security researchers repeatedly found ways to "break out" of the sandbox by manipulating the prototype chain of the Proxy objects. The fundamental architectural flaw was attempting to secure a _shared_ execution environment where the host and guest shared the same V8 context. In 2023, the maintainers of vm2 officially deprecated the project, stating that the architecture was fundamentally insecure against advanced attacks.<sup>3</sup>
- **The isolated-vm Solution:** The recommended replacement for secure JavaScript execution is isolated-vm. Unlike vm2, which tries to sanitize a shared environment, isolated-vm leverages the V8 engine's **Isolate** interface. An Isolate is a completely distinct instance of the V8 runtime with its own heap, stack, and garbage collector.
  - **Security Guarantee:** Because memory is not shared between the host and the sandbox, it is architecturally impossible for the guest code to access host objects unless they are explicitly serialized and transferred. This provides near-native security guarantees.
  - **Trade-off:** The strict separation requires that all data passed in and out of the sandbox be serialized (copied), which introduces some performance overhead compared to shared memory. However, for the security of executing arbitrary agent code, this is an acceptable cost.<sup>3</sup>

#### 2.2.2 Containerization (Docker)

For broader compatibility-such as allowing an agent to use system binaries like git, grep, or npm-language-level isolation like isolated-vm is insufficient. The standard industrial approach for these use cases is **Ephemeral Containerization**.

- **Mechanism:** When the agent requests code execution, the MCP server orchestrates the creation of a Docker container (e.g., using a node:slim or python:alpine image).
- **Isolation:** The container is created with strict constraints. It typically has no network access (unless explicitly allowlisted) and a read-only mount of the host filesystem (or a specific "workspace" volume).
- **Ephemeral Nature:** The container is destroyed immediately after execution. This ensures that no malware or malicious state can persist between executions.
- **Implementation Example:** The node-code-sandbox-mcp project implements this pattern, using Docker to create disposable environments where agents can even dynamically install dependencies to complete a task.<sup>16</sup>

#### 2.2.3 Anthropic's Dual-Boundary Approach

Anthropic's engineering blog details the security model used for their internal agents, such as Claude Code. They employ a **Dual-Boundary Sandbox** strategy <sup>5</sup>:

- **Filesystem Isolation:** The agent is restricted to a specific working directory. Any attempt to traverse up the directory tree (../) or access sensitive system paths (/etc, /var, ~/.ssh) is blocked at the operating system syscall level.
- **Network Isolation:** By default, the sandbox has no internet access. Connections are allowlisted only for specific API endpoints required by the task (e.g., a package registry or a specific API).

This "Defense in Depth" ensures that even if an agent is tricked into running malicious code that escapes the language sandbox, the blast radius is contained within the containerized environment, preventing exfiltration of secrets or lateral movement within the network.

### 2.3 Implementing Secure MCP Code Execution in TypeScript

To implement this securely in a TypeScript architecture, developers must adhere to the **Principle of Least Privilege**.

- **Input Validation:** The MCP server should not blindly execute code. It should perform static analysis (e.g., using ESLint or AST parsing) to reject code containing dangerous patterns (e.g., eval(), child_process.exec, or obfuscated strings) before it even reaches the sandbox.<sup>18</sup>
- **Resource Quotas:** Execution must be capped by time (timeout) and memory (heap limit). isolated-vm allows setting these limits natively, preventing infinite loops or memory exhaustion attacks (DoS).
- **Human-in-the-Loop (HITL):** For high-risk actions (e.g., delete_file, git push, deploy), the MCP protocol supports a user-confirmation flow. The tool execution pauses, and the user is prompted via the client interface to approve the specific command before it runs. This ensures that the human operator remains the final authority on consequential actions.<sup>19</sup>

## 3\. Programmatic Intelligence: DSPy and the TypeScript Ecosystem

While MCP addresses _how_ agents interact with tools, the question of _how_ we program the agent's cognitive behavior remains. Standard LLM development has long relied on "Prompt Engineering"-the fragile art of hand-crafting string templates. The emergence of **DSPy (Demonstrate-Search-Predict)** offers a more rigorous alternative: treating prompts as optimizable parameters within a programmable system. Historically a Python-centric framework, the principles of DSPy are now migrating to TypeScript through libraries like ax-llm.

### 3.1 The DSPy Philosophy: From Strings to Signatures

DSPy replaces the manual crafting of prompts with **Programming**. It abstracts the interaction with the LLM into three core concepts:

- **Signatures:** You define the _interface_ of the transformation (Input: Question -> Output: Answer). This focuses on _what_ needs to be done, rather than _how_ to prompt the model to do it.
- **Modules:** You chain these signatures together into programs, creating complex pipelines of reasoning.
- **Optimizers (Teleprompters):** You use a compiler to _search_ for the best prompt instructions and few-shot examples that maximize a specific metric (e.g., accuracy, code correctness).

This shift moves prompt design from a heuristic, manual process to an empirical, algorithmic one. If the underlying model changes (e.g., switching from GPT-4 to Claude 3.5 Sonnet), the developer simply re-runs the optimizer, which finds the new optimal prompt structure for the new model.

### 3.2 ax-llm: The TypeScript Implementation

The user query specifically identifies the potential for DSPy in TypeScript. Our research confirms that **ax-llm** (formerly interacting with concepts from DSPy.ts) is the leading library bringing these principles to the TypeScript ecosystem.<sup>8</sup>

#### 3.2.1 Type-Safe Signatures

Leveraging TypeScript's strong typing system, ax-llm allows developers to define signatures using TypeScript interfaces or concise string schemas. This ensures that the inputs and outputs of the LLM adhere to a strict contract, reducing runtime errors and "parser failures" where the LLM returns malformed JSON.

Example Implementation:

Instead of writing a prompt string like "Please analyze the sentiment of this text and return it as JSON...", an ax-llm developer defines a signature:

TypeScript

const classifier = ax('review:string -> sentiment:class "positive, negative, neutral"');  

The framework automatically generates the optimal prompt structure to force the model to adhere to this signature. If the model returns a value outside the allowed classes (e.g., "I think it's good"), the framework's validation layer catches it and can automatically retry with a correction prompt.<sup>9</sup>

#### 3.2.2 Algorithmic Optimization (MiPRO)

ax-llm implements sophisticated optimizers like **MiPRO** (Multi-prompt Instruction Proposal Request Optimizer). This tool automates the process of "prompt tuning."

- **Workflow:** The developer provides a small dataset of "golden examples" (Input/Output pairs). The optimizer then runs the agent against these examples, generating multiple variations of the system prompt and few-shot examples. It evaluates each variation against a scoring metric and selects the one that yields the highest accuracy.
- **Significance:** This capability allows TypeScript developers to "compile" their agents. It transforms the development process from "guessing which words might make the AI smarter" to "providing data and letting the algorithm optimize the instructions".<sup>20</sup>

#### 3.2.3 Streaming First Architecture

Unlike the original Python DSPy implementation, which was initially synchronous, ax-llm is designed from the ground up for Node.js's asynchronous, event-driven architecture. It supports **streaming responses** by default. This is critical for building responsive CLIs, where the user expects to see the agent's "thought process" appear token-by-token in real-time, rather than waiting for the entire generation to complete.<sup>9</sup>

### 3.3 Integrating DSPy/Ax with MCP

The synergy between DSPy (Ax) and MCP is significant for building autonomous agents.

- **Dynamic Tool Selection:** An MCP server exposes a dynamic list of tools. An ax-llm program can query the MCP server for available capabilities (list_tools), generate a dynamic signature based on those tools, and then execute a "Chain of Thought" reasoning module to select the correct tool and parameters.
- **Self-Correction Loops:** Using ax-llm's validation features, if an MCP tool call fails (e.g., "FileNotFound" or "SyntaxError"), the agent can automatically trigger a "Reflector" module. This module analyzes the error message and the previous attempt, then retries the action with corrected parameters, all within a type-safe loop managed by the framework.

## 4\. The Modern Agentic CLI: The "Thick Client" Paradigm

The convergence of MCP (backend capability), Code Execution (computational power), and DSPy/Ax (cognitive architecture) manifests most visibly in the **Command Line Interface (CLI)**. The industry is moving away from browser-based chat interfaces (like ChatGPT or Claude.ai) for coding tasks because they lack context of the local codebase. The future belongs to "Thick Client" CLIs that run locally, have direct filesystem access, and connect to LLMs via API.

### 4.1 Building Interfaces with React Ink

To build these sophisticated tools in TypeScript, developers must choose a TUI (Text User Interface) library. Our analysis indicates that **React Ink** is the modern standard, superior to legacy imperative libraries like blessed.

#### 4.1.1 The React Model for Terminals

**Ink** allows developers to build CLI interfaces using **React** components. It uses a custom renderer to output ANSI escape codes but allows the developer to use the full power of React state, hooks (useEffect, useState), and Flexbox layout (&lt;Box&gt;, &lt;Text&gt;).

- **State Management:** Agents are highly stateful. An agent might be running a spinner ("Thinking..."), streaming text ("Explanation..."), and updating a progress bar ("Scanning files...") simultaneously. React's declarative state model handles this complexity far better than the manual screen-painting required by blessed.<sup>22</sup>
- **Streaming Patterns:** Ink is uniquely suited for streaming agent responses. The text generation from ax-llm can be handled as a stream of data updating a React state variable, which Ink efficiently re-renders to the terminal.
- **Implementation Note:** Ink provides a useStdout hook that allows the application to write raw data directly to the standard output stream. This is crucial for "bypassing" the React render cycle when high-throughput token streaming is required, preventing UI flicker while maintaining a responsive interface.<sup>24</sup>

### 4.2 Standardization of Slash Commands

A standard User Experience (UX) pattern has emerged across all major Agent CLIs (Claude Code, OpenCode, Gemini CLI): the **Slash Command**. Just as GUI applications have menus, Agent CLIs use slash commands to trigger specific, deterministic workflows within the conversational loop. This standardization reduces cognitive load for developers moving between different tools.

**Table 1: Standard Slash Commands in Agentic CLIs** <sup>10</sup>

| **Command** | **Function** | **Underlying Mechanism** |
| --- | --- | --- |
| /init | Bootstrap configuration | Creates context files like CLAUDE.md, GEMINI.md, or AGENTS.md. |
| --- | --- | --- |
| /review | Code Review | Triggers a specific ax-llm signature that ingests git diff and outputs a critique. |
| --- | --- | --- |
| /sandbox | Security Control | Toggles Docker/Network isolation settings or restarts the execution environment. |
| --- | --- | --- |
| /compact | Context Management | Summarizes the conversation history to free up tokens in the context window. |
| --- | --- | --- |
| /mcp | Tool Management | Lists connected MCP servers, debugs connections, and allows adding/removing tools dynamically. |
| --- | --- | --- |
| /help | Documentation | Displays available commands and usage patterns. |
| --- | --- | --- |

In a TypeScript implementation using ax-llm, a slash command can be mapped directly to a specific "Signature." For example, when a user types /fix, the CLI invokes the FixBug signature (Input: Error Log + Code -> Output: Patch), executes the result via the MCP file-system tool, and streams the output via Ink.

### 4.3 Case Studies: Claude Code vs. OpenCode

- **Claude Code:** Anthropic's official CLI tool represents the "batteries-included" approach. It is deeply integrated with the Claude API and features highly polished "Agent Skills" (like codebase navigation). It emphasizes the "Unix Philosophy," allowing users to pipe data into the agent (e.g., cat logs | claude).<sup>26</sup>
- **OpenCode:** This open-source alternative focuses on modularity and model agnosticism. It allows users to switch between providers (OpenAI, Anthropic, Gemini) and emphasizes extensive configuration via markdown files. It demonstrates how a TypeScript CLI can offer a "Bring Your Own Model" architecture while maintaining a consistent developer experience.<sup>11</sup>

## 5\. Synthesis and Future Outlook

The research indicates a clear trajectory for AI development tools. We are witnessing the maturation of the **"Thick Client Agent"** architecture.

**The Convergent Stack:**

- **The Client is the Agent:** The CLI, built with **Ink**, runs locally on the developer's machine, providing a responsive, stateful interface.
- **Logic is Local:** Code execution happens in a local, secure sandbox (**Docker/isolated-vm**), utilizing the host's CPU for data processing and saving tokens.
- **Intelligence is Remote but Optimized:** The LLM provides the high-level reasoning, but the prompts driving that reasoning are dynamically optimized, typed, and compiled by **ax-llm**.
- **Connectivity is Standardized:** **MCP** provides the universal plug-and-play layer, allowing the agent to connect to any tool (Postgres, Stripe, GitHub) without custom integration code.

For the TypeScript developer, mastering this stack-**MCP for connectivity, Docker/isolated-vm for security, ax-llm for cognition, and Ink for interface**-is the key to building the next generation of autonomous software engineering agents. This architecture moves beyond the limitations of chat-based assistants, enabling the creation of robust, secure, and highly capable digital coworkers that integrate seamlessly into the modern software development lifecycle.

#### Works cited

- Code execution with MCP: building more efficient AI agents \\ Anthropic, accessed December 1, 2025, <https://www.anthropic.com/engineering/code-execution-with-mcp>
- Introducing advanced tool use on the Claude Developer Platform - Anthropic, accessed December 1, 2025, <https://www.anthropic.com/engineering/advanced-tool-use>
- vm2 is now deprecated · Issue #218 · TooTallNate/proxy-agents - GitHub, accessed December 1, 2025, <https://github.com/TooTallNate/proxy-agents/issues/218>
- Discontinued · Issue #533 · patriksimek/vm2 - GitHub, accessed December 1, 2025, <https://github.com/patriksimek/vm2/issues/533>
- Making Claude Code more secure and autonomous with sandboxing - Anthropic, accessed December 1, 2025, <https://www.anthropic.com/engineering/claude-code-sandboxing>
- The Quiet Security Crisis Brewing in AI: Why Your Enterprise Needs to Understand MCP Vulnerabilities, accessed December 1, 2025, <https://dr-arsanjani.medium.com/the-quiet-security-crisis-brewing-in-ai-why-your-enterprise-needs-to-understand-mcp-ca832e4d9595>
- The MCP Security Survival Guide: Best Practices, Pitfalls, and Real-World Lessons, accessed December 1, 2025, <https://towardsdatascience.com/the-mcp-security-survival-guide-best-practices-pitfalls-and-real-world-lessons/>
- ax-llm/ax: The pretty much "official" DSPy framework for Typescript - GitHub, accessed December 1, 2025, <https://github.com/ax-llm/ax>
- DSPy in TypeScript: The Future of Building with LLMs - axllm.dev, accessed December 1, 2025, <https://axllm.dev/dspy/>
- Slash commands - Claude Code Docs, accessed December 1, 2025, <https://code.claude.com/docs/en/slash-commands>
- TUI - OpenCode, accessed December 1, 2025, <https://opencode.ai/docs/tui/>
- opencode-ai/opencode: A powerful AI coding agent. Built for the terminal. - GitHub, accessed December 1, 2025, <https://github.com/opencode-ai/opencode>
- Anthropic's New MCP Blog Post is Huge - YouTube, accessed December 1, 2025, <https://www.youtube.com/watch?v=CT4WfKEQY6M>
- MCP Security - Risks and Best Practices - Check Point Software, accessed December 1, 2025, <https://www.checkpoint.com/cyber-hub/cyber-security/what-is-ai-security/mcp-security/>
- Hobbyists in the Supply Chain - DEV Community, accessed December 1, 2025, <https://dev.to/latobibor/hobbyists-in-the-supply-chain-2gne>
- The Node.js Code Sandbox MCP Server: An AI Engineer's Deep Dive, accessed December 1, 2025, <https://skywork.ai/skypage/en/nodejs-ai-engineer-sandbox/1981252894550052864>
- alfonsograziano/node-code-sandbox-mcp: A Node.js-based Model Context Protocol server that spins up disposable Docker containers to execute arbitrary JavaScript. - GitHub, accessed December 1, 2025, <https://github.com/alfonsograziano/node-code-sandbox-mcp>
- A Comprehensive Framework for Secure Code Review in Go and TypeScript | by Greg Lusk, accessed December 1, 2025, <https://medium.com/@greglusk/a-comprehensive-framework-for-secure-code-review-in-go-and-typescript-7aa7afd0adaa>
- Specification - Model Context Protocol, accessed December 1, 2025, <https://modelcontextprotocol.io/specification/2025-11-25>
- TS-DSPY: Building Type-Safe LLM Apps with TypeScript | by Arnav Dadarya | Medium, accessed December 1, 2025, <https://medium.com/@ardada2468/ts-dspy-building-type-safe-llm-apps-with-typescript-9ea3eb894a4f>
- DSPy, accessed December 1, 2025, <https://dspy.ai/>
- ink vs blessed | Terminal User Interface (TUI) Libraries Comparison - NPM Compare, accessed December 1, 2025, <https://npm-compare.com/blessed,ink>
- React + Ink CLI Tutorial - How to Build a Browser Command Line Application, accessed December 1, 2025, <https://www.freecodecamp.org/news/react-js-ink-cli-tutorial/>
- vadimdemedes/ink: React for interactive command-line apps - GitHub, accessed December 1, 2025, <https://github.com/vadimdemedes/ink>
- CLI | opencode, accessed December 1, 2025, <https://opencode.ai/docs/cli/>
- Claude Code: Best practices for agentic coding - Anthropic, accessed December 1, 2025, <https://www.anthropic.com/engineering/claude-code-best-practices>