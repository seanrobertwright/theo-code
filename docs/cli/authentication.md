# Authentication Setup

Theo Code supports two main authentication methods to access AI models. Choose the method that best fits your use case:

1.  **Theo OAuth (Recommended):**
    - Use this option to log in with your theo.ai account.
    - During initial startup, Theo Code will direct you to the theo.ai authentication page. Once authenticated, your credentials will be cached locally so the web login can be skipped on subsequent runs.
    - **Requirements:**
      - Internet connection for initial authentication
    - **Benefits:**
      - Seamless access to Ollama models
      - Automatic credential refresh
      - No manual API key management required

    **Getting Started:**

    ```bash
    # Start Theo Code and follow the OAuth flow
    theo
    ```

    **Cost:** Free

    **Notes:** A specific quota for different models is not specified; model fallback may occur to preserve shared experience quality.

2.  **<a id="openai-api"></a>OpenAI-Compatible API:**
    - Use API keys for OpenAI or other compatible providers.
    - This method allows you to use various AI models through API keys.

    **Configuration Methods:**

    a) **Environment Variables:**

    ```bash
    export OPENAI_API_KEY="your_api_key_here"
    export OPENAI_BASE_URL="your_api_endpoint"  # Optional
    export OPENAI_MODEL="your_model_choice"     # Optional
    ```

    b) **Project `.env` File:**
    Create a `.env` file in your project root:

    ```env
    OPENAI_API_KEY=your_api_key_here
    OPENAI_BASE_URL=your_api_endpoint
    OPENAI_MODEL=your_model_choice
    ```

    **Supported Providers:**
    - OpenAI (https://platform.openai.com/api-keys)
    - Alibaba Cloud Bailian
    - ModelScope
    - OpenRouter
    - Azure OpenAI
    - Any OpenAI-compatible API

## Switching Authentication Methods

To switch between authentication methods during a session, use the `/auth` command in the CLI interface:

```bash
# Within the CLI, type:
/auth
```

This will allow you to reconfigure your authentication method without restarting the application.

### Persisting Environment Variables with `.env` Files

You can create a **`.theo/.env`** file in your project directory or in your home directory. Creating a plain **`.env`** file also works, but `.theo/.env` is recommended to keep Theo Code variables isolated from other tools.

**Important:** Some environment variables (like `DEBUG` and `DEBUG_MODE`) are automatically excluded from project `.env` files to prevent interference with theo-code behavior. Use `.theo/.env` files for theo-code specific variables.

Theo Code automatically loads environment variables from the **first** `.env` file it finds, using the following search order:

1. Starting in the **current directory** and moving upward toward `/`, for each directory it checks:
   1. `.theo/.env`
   2. `.env`
2. If no file is found, it falls back to your **home directory**:
   - `~/.theo/.env`
   - `~/.env`

> **Important:** The search stops at the **first** file encountered—variables are **not merged** across multiple files.

#### Examples

**Project-specific overrides** (take precedence when you are inside the project):

```bash
mkdir -p .theo
cat >> .theo/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Theo/Theo3-Coder-480B-A35B-Instruct"
EOF
```

**User-wide settings** (available in every directory):

```bash
mkdir -p ~/.theo
cat >> ~/.theo/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="Theo3-coder"
EOF
```

## Non-Interactive Mode / Headless Environments

When running Theo Code in a non-interactive environment, you cannot use the OAuth login flow.
Instead, you must configure authentication using environment variables.

The CLI will automatically detect if it is running in a non-interactive terminal and will use the
OpenAI-compatible API method if configured:

1.  **OpenAI-Compatible API:**
    - Set the `OPENAI_API_KEY` environment variable.
    - Optionally set `OPENAI_BASE_URL` and `OPENAI_MODEL` for custom endpoints.
    - The CLI will use these credentials to authenticate with the API provider.

**Example for headless environments:**

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
export OPENAI_MODEL="Theo/Theo3-Coder-480B-A35B-Instruct"

# Run Theo Code
theo
```

If no API key is set in a non-interactive session, the CLI will exit with an error prompting you to configure authentication.
