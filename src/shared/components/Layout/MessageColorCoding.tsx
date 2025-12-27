/**
 * @fileoverview Message color coding utilities and components
 * @module shared/components/Layout/MessageColorCoding
 */

import * as React from 'react';
import { Box, Text } from 'ink';
import type { ColorScheme } from './types.js';
import type { Message, ContentBlock } from '../../types/index.js';

// =============================================================================
// COLOR CODING UTILITIES
// =============================================================================

/**
 * Enhanced message color scheme with distinct colors for different message types.
 */
export interface MessageColorScheme {
  user: {
    primary: string;
    secondary: string;
    background?: string;
  };
  assistant: {
    primary: string;
    secondary: string;
    background?: string;
  };
  system: {
    primary: string;
    secondary: string;
    background?: string;
  };
  tool: {
    primary: string;
    secondary: string;
    background?: string;
  };
  error: {
    primary: string;
    secondary: string;
    background?: string;
  };
}

/**
 * Create enhanced message color scheme from base color scheme.
 */
export function createMessageColorScheme(baseScheme: ColorScheme): MessageColorScheme {
  return {
    user: {
      primary: baseScheme.colors.userMessage,
      secondary: 'blueBright',
      background: 'bgBlue',
    },
    assistant: {
      primary: baseScheme.colors.assistantMessage,
      secondary: 'greenBright',
      background: 'bgGreen',
    },
    system: {
      primary: baseScheme.colors.systemMessage,
      secondary: 'gray',
      background: 'bgGray',
    },
    tool: {
      primary: baseScheme.colors.toolCall,
      secondary: 'magentaBright',
      background: 'bgMagenta',
    },
    error: {
      primary: baseScheme.colors.errorMessage,
      secondary: 'redBright',
      background: 'bgRed',
    },
  };
}

/**
 * Get message colors for a specific role.
 */
export function getMessageColors(
  role: string,
  messageColorScheme: MessageColorScheme
): { primary: string; secondary: string; background?: string } {
  switch (role) {
    case 'user':
      return messageColorScheme.user;
    case 'assistant':
      return messageColorScheme.assistant;
    case 'system':
      return messageColorScheme.system;
    case 'tool':
      return messageColorScheme.tool;
    default:
      return messageColorScheme.assistant; // Default fallback
  }
}

/**
 * Get role display information.
 */
export function getRoleDisplayInfo(role: string): {
  label: string;
  icon: string;
  prefix: string;
} {
  switch (role) {
    case 'user':
      return {
        label: 'You',
        icon: '👤',
        prefix: '> ',
      };
    case 'assistant':
      return {
        label: 'Assistant',
        icon: '🤖',
        prefix: '< ',
      };
    case 'system':
      return {
        label: 'System',
        icon: '⚙️',
        prefix: '! ',
      };
    case 'tool':
      return {
        label: 'Tool',
        icon: '🔧',
        prefix: '# ',
      };
    default:
      return {
        label: role,
        icon: '💬',
        prefix: '? ',
      };
  }
}

// =============================================================================
// SYNTAX HIGHLIGHTING
// =============================================================================

/**
 * Syntax highlighting configuration.
 */
export interface SyntaxHighlightConfig {
  keywords: string[];
  strings: RegExp;
  comments: RegExp;
  functions: RegExp;
  numbers: RegExp;
  operators: RegExp;
}

/**
 * Language-specific syntax highlighting configurations.
 */
export const SYNTAX_CONFIGS: Record<string, SyntaxHighlightConfig> = {
  javascript: {
    keywords: ['const', 'let', 'var', 'function', 'class', 'if', 'else', 'for', 'while', 'return', 'import', 'export'],
    strings: /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g,
    comments: /\/\/.*$|\/\*[\s\S]*?\*\//gm,
    functions: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
    numbers: /\b\d+\.?\d*\b/g,
    operators: /[+\-*/%=<>!&|^~?:]/g,
  },
  typescript: {
    keywords: ['const', 'let', 'var', 'function', 'class', 'interface', 'type', 'if', 'else', 'for', 'while', 'return', 'import', 'export'],
    strings: /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g,
    comments: /\/\/.*$|\/\*[\s\S]*?\*\//gm,
    functions: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
    numbers: /\b\d+\.?\d*\b/g,
    operators: /[+\-*/%=<>!&|^~?:]/g,
  },
  python: {
    keywords: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'import', 'from', 'try', 'except', 'with'],
    strings: /(["'])((?:\\.|(?!\1)[^\\])*?)\1/g,
    comments: /#.*$/gm,
    functions: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    numbers: /\b\d+\.?\d*\b/g,
    operators: /[+\-*/%=<>!&|^~]/g,
  },
  json: {
    keywords: ['true', 'false', 'null'],
    strings: /(")([^"\\]|\\.)*(")/g,
    comments: /(?:)/g, // JSON doesn't have comments
    functions: /(?:)/g, // JSON doesn't have functions
    numbers: /-?\b\d+\.?\d*\b/g,
    operators: /[{}[\]:,]/g,
  },
};

/**
 * Apply syntax highlighting to code text.
 */
export function applySyntaxHighlighting(
  code: string,
  language: string,
  colorScheme: ColorScheme
): React.ReactNode[] {
  const config = SYNTAX_CONFIGS[language.toLowerCase()];
  if (!config) {
    // No syntax highlighting available, return plain text
    return [<Text key="plain" color={colorScheme.colors.code}>{code}</Text>];
  }
  
  const parts: React.ReactNode[] = [];
  const lines = code.split('\n');
  
  lines.forEach((line, lineIndex) => {
    const lineParts: React.ReactNode[] = [];
    let lastIndex = 0;
    
    // Process different syntax elements
    const processRegex = (regex: RegExp, color: string, type: string) => {
      let match;
      regex.lastIndex = 0; // Reset regex
      
      while ((match = regex.exec(line)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          lineParts.push(
            <Text key={`${type}-before-${match.index}`} color={colorScheme.colors.code}>
              {line.slice(lastIndex, match.index)}
            </Text>
          );
        }
        
        // Add highlighted match
        lineParts.push(
          <Text key={`${type}-${match.index}`} color={color}>
            {match[0]}
          </Text>
        );
        
        lastIndex = match.index + match[0].length;
      }
    };
    
    // Apply highlighting in order of precedence
    processRegex(config.comments, colorScheme.colors.comment, 'comment');
    processRegex(config.strings, colorScheme.colors.string, 'string');
    processRegex(config.numbers, colorScheme.colors.keyword, 'number');
    processRegex(config.functions, colorScheme.colors.keyword, 'function');
    
    // Process keywords
    config.keywords.forEach((keyword) => {
      const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'g');
      processRegex(keywordRegex, colorScheme.colors.keyword, 'keyword');
    });
    
    // Add remaining text
    if (lastIndex < line.length) {
      lineParts.push(
        <Text key={`remaining-${lineIndex}`} color={colorScheme.colors.code}>
          {line.slice(lastIndex)}
        </Text>
      );
    }
    
    // Add line to parts
    if (lineParts.length === 0) {
      parts.push(
        <Text key={`line-${lineIndex}`} color={colorScheme.colors.code}>
          {line}
        </Text>
      );
    } else {
      parts.push(
        <Box key={`line-${lineIndex}`}>
          {lineParts}
        </Box>
      );
    }
    
    // Add newline except for last line
    if (lineIndex < lines.length - 1) {
      parts.push(<Text key={`newline-${lineIndex}`}>{'\n'}</Text>);
    }
  });
  
  return parts;
}

// =============================================================================
// MESSAGE RENDERING COMPONENTS
// =============================================================================

/**
 * Props for ColorCodedMessage component.
 */
export interface ColorCodedMessageProps {
  message: Message;
  colorScheme: ColorScheme;
  showTimestamp?: boolean;
  showIcon?: boolean;
  compact?: boolean;
}

/**
 * Color-coded message component with enhanced styling.
 */
export const ColorCodedMessage: React.FC<ColorCodedMessageProps> = ({
  message,
  colorScheme,
  showTimestamp = false,
  showIcon = true,
  compact = false,
}) => {
  const messageColorScheme = createMessageColorScheme(colorScheme);
  const colors = getMessageColors(message.role, messageColorScheme);
  const roleInfo = getRoleDisplayInfo(message.role);
  
  return (
    <Box flexDirection="column" marginBottom={compact ? 0 : 1}>
      {/* Message header */}
      <Box>
        {showIcon && (
          <Text color={colors.primary}>
            {roleInfo.icon}
          </Text>
        )}
        <Text bold color={colors.primary}>
          {roleInfo.label}
        </Text>
        {showTimestamp && message.timestamp && (
          <Text color={colors.secondary}>
            {' '}({new Date(message.timestamp).toLocaleTimeString()})
          </Text>
        )}
        <Text color={colors.primary}>:</Text>
      </Box>
      
      {/* Message content */}
      <Box marginLeft={showIcon ? 3 : 2} flexDirection="column">
        <ColorCodedContent
          content={message.content}
          colorScheme={colorScheme}
        />
      </Box>
      
      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <Box marginLeft={showIcon ? 3 : 2} flexDirection="column">
          {message.toolCalls.map((toolCall) => (
            <Box key={toolCall.id} marginTop={1}>
              <Text color={messageColorScheme.tool.primary}>
                🔧 {toolCall.name}
              </Text>
              <Text color={messageColorScheme.tool.secondary}>
                ({Object.keys(toolCall.arguments).join(', ')})
              </Text>
            </Box>
          ))}
        </Box>
      )}
      
      {/* Tool results */}
      {message.toolResults && message.toolResults.length > 0 && (
        <Box marginLeft={showIcon ? 3 : 2} flexDirection="column">
          {message.toolResults.map((result) => (
            <Box key={result.toolCallId} marginTop={1} flexDirection="column">
              <Text color={result.isError ? messageColorScheme.error.primary : messageColorScheme.tool.primary}>
                {result.isError ? '❌' : '✅'} Tool Result
              </Text>
              <Box marginLeft={2}>
                <Text color={result.isError ? messageColorScheme.error.secondary : 'white'}>
                  {result.content}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

/**
 * Props for ColorCodedContent component.
 */
interface ColorCodedContentProps {
  content: string | ContentBlock[];
  colorScheme: ColorScheme;
}

/**
 * Color-coded content component with syntax highlighting.
 */
const ColorCodedContent: React.FC<ColorCodedContentProps> = ({
  content,
  colorScheme,
}) => {
  if (typeof content === 'string') {
    return <ColorCodedText text={content} colorScheme={colorScheme} />;
  }
  
  return (
    <>
      {content.map((block, index) => (
        <ColorCodedContentBlock
          key={index}
          block={block}
          colorScheme={colorScheme}
        />
      ))}
    </>
  );
};

/**
 * Color-coded content block component.
 */
const ColorCodedContentBlock: React.FC<{
  block: ContentBlock;
  colorScheme: ColorScheme;
}> = ({ block, colorScheme }) => {
  const messageColorScheme = createMessageColorScheme(colorScheme);
  
  switch (block.type) {
    case 'text':
      return <ColorCodedText text={block.text} colorScheme={colorScheme} />;
      
    case 'tool_use':
      return (
        <Box marginY={1}>
          <Text color={messageColorScheme.tool.primary}>
            🔧 {block.name}
          </Text>
          <Text color={messageColorScheme.tool.secondary}>
            ({Object.keys(block.input).join(', ')})
          </Text>
        </Box>
      );
      
    case 'tool_result':
      return (
        <Box marginY={1} flexDirection="column">
          <Text color={block.isError ? messageColorScheme.error.primary : messageColorScheme.tool.primary}>
            {block.isError ? '❌' : '✅'} Tool Result
          </Text>
          <Box marginLeft={2}>
            <Text color={block.isError ? messageColorScheme.error.secondary : 'white'}>
              {block.content}
            </Text>
          </Box>
        </Box>
      );
      
    default:
      return null;
  }
};

/**
 * Color-coded text component with code block detection.
 */
const ColorCodedText: React.FC<{
  text: string;
  colorScheme: ColorScheme;
}> = ({ text, colorScheme }) => {
  // Detect code blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      parts.push(
        <Text key={`text-${lastIndex}`}>
          {beforeText}
        </Text>
      );
    }
    
    // Add code block with syntax highlighting
    const language = match[1] || 'text';
    const code = match[2] || '';
    
    parts.push(
      <Box key={`code-${match.index}`} marginY={1} flexDirection="column">
        {language && language !== 'text' && (
          <Text color={colorScheme.colors.comment}>
            {language}:
          </Text>
        )}
        <Box borderStyle="single" borderColor={colorScheme.colors.border} paddingX={1}>
          <Box flexDirection="column">
            {applySyntaxHighlighting(code, language, colorScheme)}
          </Box>
        </Box>
      </Box>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <Text key={`text-${lastIndex}`}>
        {text.slice(lastIndex)}
      </Text>
    );
  }
  
  return parts.length > 0 ? <>{parts}</> : <Text>{text}</Text>;
};