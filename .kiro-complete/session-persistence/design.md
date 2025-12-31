# Design Document: Session Persistence & Management

## Overview

The Session Persistence & Management system provides comprehensive session lifecycle management for theo-code, enabling users to save, restore, search, and manage their conversation sessions. The system is built around a file-based storage architecture with JSON serialization, automatic migration support, and efficient indexing for fast session discovery.

The design emphasizes data integrity, performance, and user experience while maintaining backward compatibility and supporting enterprise-grade features like configurable retention policies and secure sharing.

## Architecture

The session persistence system follows a layered architecture:

```
┌─────────────────────────────────────────────────────┐
│                 CLI Commands Layer                   │
│  /resume, /sessions, /sessions search, /sessions    │
│  delete, /sessions export, /sessions share          │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│              Session Manager Service                 │
│  - Session lifecycle management                      │
│  - Auto-save coordination                           │
│  - Search and filtering                             │
│  - Migration orchestration                          │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│               Storage Abstraction Layer              │
│  - File I/O operations                              │
│  - Compression/decompression                        │
│  - Index management                                 │
│  - Backup and recovery                              │
└─────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────┐
│                File System Layer                     │
│  ~/.theo-code/sessions/                             │
│  ├── index.json                                     │
│  ├── sessions/                                      │
│  │   ├── {session-id}.json                         │
│  │   └── {session-id}.json.bak                     │
│  └── migrations/                                    │
└─────────────────────────────────────────────────────┘
```

## Components and Interfaces

### SessionManager

The central orchestrator for all session operations:

```typescript
interface SessionManager {
  // Core lifecycle
  createSession(model: string, workspaceRoot: string): Promise<Session>;
  saveSession(session: Session): Promise<void>;
  loadSession(sessionId: SessionId): Promise<Session>;
  deleteSession(sessionId: SessionId): Promise<void>;
  
  // Auto-save
  enableAutoSave(intervalMs: number): void;
  disableAutoSave(): void;
  
  // Discovery and search
  listSessions(options?: ListOptions): Promise<SessionMetadata[]>;
  searchSessions(query: string): Promise<SessionSearchResult[]>;
  
  // Import/export
  exportSession(sessionId: SessionId, format: ExportFormat): Promise<string>;
  importSession(data: string, format: ExportFormat): Promise<SessionId>;
  
  // Migration
  migrateSession(session: any, fromVersion: string): Promise<Session>;
}
```

### SessionStorage

Low-level storage operations with compression and validation:

```typescript
interface SessionStorage {
  // File operations
  writeSession(sessionId: SessionId, data: SessionData): Promise<void>;
  readSession(sessionId: SessionId): Promise<SessionData>;
  deleteSession(sessionId: SessionId): Promise<void>;
  sessionExists(sessionId: SessionId): Promise<boolean>;
  
  // Index management
  updateIndex(metadata: SessionMetadata): Promise<void>;
  getIndex(): Promise<SessionIndex>;
  rebuildIndex(): Promise<void>;
  
  // Backup and recovery
  createBackup(sessionId: SessionId): Promise<string>;
  restoreFromBackup(backupPath: string): Promise<SessionId>;
  
  // Cleanup
  cleanupOldSessions(maxCount: number, maxAgeMs: number): Promise<SessionId[]>;
}
```

### SessionIndex

Fast metadata access for session discovery:

```typescript
interface SessionIndex {
  sessions: Record<SessionId, SessionMetadata>;
  lastUpdated: number;
  version: string;
}

interface SessionMetadata {
  id: SessionId;
  created: number;
  lastModified: number;
  model: string;
  messageCount: number;
  tokenCount: SessionTokenCount;
  workspaceRoot: string;
  contextFiles: string[];
  tags: string[];
  preview: string; // First user message or summary
}
```

## Data Models

### Session Schema

```typescript
interface Session {
  id: SessionId;
  version: string; // Schema version for migration
  created: number;
  lastModified: number;
  model: string;
  workspaceRoot: string;
  
  // Conversation data
  messages: Message[];
  contextFiles: string[];
  
  // Metrics
  tokenCount: SessionTokenCount;
  
  // Metadata
  tags: string[];
  notes?: string;
}

interface SessionTokenCount {
  total: number;
  input: number;
  output: number;
}
```

### Storage Format

Sessions are stored as compressed JSON with the following structure:

```json
{
  "version": "1.0.0",
  "compressed": true,
  "checksum": "sha256:...",
  "data": {
    "id": "session-uuid",
    "created": 1703875200000,
    "lastModified": 1703875800000,
    "model": "gpt-4o",
    "workspaceRoot": "/path/to/workspace",
    "messages": [...],
    "contextFiles": [...],
    "tokenCount": {...},
    "tags": [],
    "notes": ""
  }
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several areas where properties can be consolidated:

**Redundancy Analysis:**
- Properties about file storage location (4.1) and data format (4.2) can be combined into a comprehensive storage consistency property
- Properties about search functionality (5.1, 5.2) can be combined into a single comprehensive search property
- Properties about migration data preservation (6.4) and version updates (6.5) can be combined into a migration integrity property
- Properties about export sanitization (7.2) and metadata inclusion (7.5) can be combined into a sharing data property

**Consolidated Properties:**

Property 1: Session uniqueness and file creation
*For any* new session creation, the system should generate a unique session ID and create a corresponding session file
**Validates: Requirements 1.1**

Property 2: Auto-save timing consistency
*For any* session modification, the system should save the session to disk within 5 seconds
**Validates: Requirements 1.2**

Property 3: Crash recovery data preservation
*For any* unexpected termination, all session data up to the last auto-save point should be preserved and recoverable
**Validates: Requirements 1.3**

Property 4: Timestamp consistency
*For any* session modification, the lastModified timestamp should be updated to reflect the change time
**Validates: Requirements 1.4**

Property 5: Session restoration completeness
*For any* saved session, restoring it should recreate the exact same session state including all messages, context files, and metadata
**Validates: Requirements 2.2, 2.3, 2.4**

Property 6: Session metadata display completeness
*For any* session listing operation, all required metadata fields (ID, dates, counts, model) should be present in the output
**Validates: Requirements 3.2**

Property 7: Session deletion completeness
*For any* session deletion operation, both the session file and index entry should be completely removed
**Validates: Requirements 3.3**

Property 8: Session export format consistency
*For any* session export operation, the output should be valid JSON containing all session data
**Validates: Requirements 3.4**

Property 9: Automatic cleanup threshold enforcement
*For any* session storage exceeding 50 sessions, the oldest sessions should be automatically removed to maintain the limit
**Validates: Requirements 3.5**

Property 10: Storage location consistency
*For any* session save operation, the session file should be stored in the correct directory with proper JSON format and schema validation
**Validates: Requirements 4.1, 4.2**

Property 11: Sensitive data exclusion
*For any* session file, it should never contain API keys, credentials, or other sensitive information
**Validates: Requirements 4.3**

Property 12: Compression effectiveness
*For any* session with compression enabled, the compressed file should be smaller than the uncompressed equivalent without data loss
**Validates: Requirements 4.4**

Property 13: File corruption handling
*For any* corrupted or inaccessible session file, the system should handle the error gracefully without crashing
**Validates: Requirements 4.5**

Property 14: Search comprehensiveness
*For any* search query, the system should find matches in message content, file names, and session metadata
**Validates: Requirements 5.1, 5.2**

Property 15: Filter accuracy
*For any* filter criteria (model, date), the results should only contain sessions matching the specified criteria
**Validates: Requirements 5.3, 5.4**

Property 16: Search result enhancement
*For any* search results, matching text should be highlighted and relevance scores should be provided
**Validates: Requirements 5.5**

Property 17: Migration completeness
*For any* session with an older schema version, automatic migration should preserve all data while updating the version marker
**Validates: Requirements 6.1, 6.4, 6.5**

Property 18: Migration error handling
*For any* failed migration, a backup should be created and the error should be logged
**Validates: Requirements 6.2**

Property 19: Backward compatibility maintenance
*For any* session from the last 3 schema versions, the system should be able to load and migrate it successfully
**Validates: Requirements 6.3**

Property 20: Sharing data integrity
*For any* session export for sharing, sensitive information should be removed while preserving necessary metadata and workspace information
**Validates: Requirements 7.2, 7.5**

Property 21: Import uniqueness
*For any* imported shared session, a new unique session ID should be assigned to prevent conflicts
**Validates: Requirements 7.4**

Property 22: Import validation
*For any* session import operation, the format should be validated and warnings should be shown for missing context
**Validates: Requirements 7.3**

Property 23: Configuration flexibility
*For any* storage configuration change, the system should respect custom directory paths and retention policies
**Validates: Requirements 8.1, 8.2**

Property 24: Configuration validation
*For any* auto-save interval configuration, only values between 5 and 300 seconds should be accepted
**Validates: Requirements 8.4**

Property 25: Storage limit notification
*For any* storage limit exceeded condition, the user should be notified with suggested cleanup actions
**Validates: Requirements 8.5**

## Error Handling

The session persistence system implements comprehensive error handling:

### File System Errors
- **Permission Denied**: Graceful fallback to read-only mode with user notification
- **Disk Full**: Automatic cleanup of old sessions and user warning
- **Corruption**: Automatic backup restoration with data recovery attempts
- **Missing Files**: Index rebuilding and orphaned file cleanup

### Data Validation Errors
- **Schema Mismatch**: Automatic migration with backup creation
- **Invalid JSON**: Backup restoration and error logging
- **Missing Fields**: Default value insertion with user notification
- **Type Errors**: Data coercion with validation warnings

### Network and Concurrency Errors
- **Concurrent Access**: File locking with retry mechanisms
- **Race Conditions**: Atomic operations with transaction-like behavior
- **Timeout Errors**: Graceful degradation with partial data preservation

## Testing Strategy

### Unit Testing Approach
The session persistence system will use comprehensive unit tests covering:

- **Storage Operations**: File I/O, compression, validation
- **Session Lifecycle**: Creation, modification, deletion
- **Migration Logic**: Schema updates, data preservation
- **Search and Filtering**: Query processing, result ranking
- **Error Scenarios**: Corruption, permissions, validation failures

### Property-Based Testing Approach
Property-based tests will verify universal behaviors using **fast-check** library with minimum 100 iterations per property:

- **Data Integrity Properties**: Round-trip serialization, migration preservation
- **Timing Properties**: Auto-save intervals, cleanup thresholds
- **Search Properties**: Query completeness, filter accuracy
- **Security Properties**: Sensitive data exclusion, sanitization

Each property-based test will be tagged with comments referencing the design document:
```typescript
// **Feature: session-persistence, Property 5: Session restoration completeness**
```

### Integration Testing
- **End-to-End Workflows**: Complete session lifecycle testing
- **CLI Command Integration**: All session-related commands
- **Cross-Platform Testing**: Windows, macOS, Linux compatibility
- **Performance Testing**: Large session handling, search performance

## Implementation Notes

### Performance Considerations
- **Lazy Loading**: Sessions loaded on-demand to reduce memory usage
- **Incremental Indexing**: Index updates only for modified sessions
- **Compression**: Configurable compression for storage optimization
- **Caching**: In-memory cache for frequently accessed sessions

### Security Considerations
- **Data Sanitization**: Automatic removal of sensitive information
- **File Permissions**: Restricted access to session directories
- **Backup Security**: Encrypted backups for sensitive environments
- **Audit Logging**: Optional logging of all session operations

### Scalability Considerations
- **Pagination**: Large session lists handled with pagination
- **Background Processing**: Non-blocking operations for large datasets
- **Storage Limits**: Configurable limits with automatic cleanup
- **Index Optimization**: Efficient search indexing for fast queries