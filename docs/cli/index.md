# Theo Code CLI

Within Theo Code, `packages/cli` is the frontend for users to send and receive prompts with Theo and other AI models and their associated tools. For a general overview of Theo Code, see the [main documentation page](../index.md).

## Navigating this section

- **[Authentication](./authentication.md):** A guide to setting up authentication with Theo OAuth and OpenAI-compatible providers.
- **[Commands](./commands.md):** A reference for Theo Code CLI commands (e.g., `/help`, `/tools`, `/theme`).
- **[Configuration](./configuration.md):** A guide to tailoring Theo Code CLI behavior using configuration files.
- **[Token Caching](./token-caching.md):** Optimize API costs through token caching.
- **[Themes](./themes.md)**: A guide to customizing the CLI's appearance with different themes.
- **[Tutorials](tutorials.md)**: A tutorial showing how to use Theo Code to automate a development task.

## Non-interactive mode

Theo Code can be run in a non-interactive mode, which is useful for scripting and automation. In this mode, you pipe input to the CLI, it executes the command, and then it exits.

The following example pipes a command to Theo Code from your terminal:

```bash
echo "What is fine tuning?" | theo
```

Theo Code executes the command and prints the output to your terminal. Note that you can achieve the same behavior by using the `--prompt` or `-p` flag. For example:

```bash
theo -p "What is fine tuning?"
```
