# Log Output Storage Design

## Problem

In previous practice, command output containing special characters (binary data, ANSI codes, control characters) could corrupt JSON files when stored directly in `task.output` and `task.stderr` fields.

## Solution

Separate command output storage from JSON metadata storage:

- **JSON files**: Store connection info, task metadata (status, exit_code, log references)
- **Log files**: Store complete command output (append-only, safe for any characters)

## Architecture

### Storage Structure

```
data/
├── sessions.json           # Session index
└── sessions/
│   ├── sess_xxx.json       # Connection info + task metadata (no output)
│   ├── sess_xxx.log        # Command output log (append-only)
│   ├── sess_xxx.1.log      # Rotated log #1 (when log > 1MB)
│   ├── sess_xxx.2.log      # Rotated log #2
│   ├── sess_xxx.1.json     # Legacy archive #1 (messages)
│   └── sess_xxx.2.json     # Legacy archive #2
```

### Log File Format

Each log entry is a single line with structured format:

```
[timestamp] [task_id] [type] content
```

**Important**: Content is escaped to ensure single-line format. Newlines in output are replaced with `\n` (literal backslash-n) before writing, and restored when reading.

Types:
- `COMMAND` - The command being executed
- `STDOUT` - Standard output chunk (newlines escaped)
- `STDERR` - Standard error chunk (newlines escaped)
- `EXIT` - Exit code
- `SYSTEM` - System messages (e.g., password prompt detected)

Example (raw log file):
```
[2026-04-11T10:22:48Z] [task_abc123] [COMMAND] df -h
[2026-04-11T10:22:49Z] [task_abc123] [STDOUT] Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       100G   50G   50G  50% /
[2026-04-11T10:22:50Z] [task_abc123] [EXIT] 0
```

When read back, the `\n` is converted back to actual newline, restoring the original multi-line output.

### Task Structure Changes

**Before (legacy):**
```json
{
  "id": "task_xxx",
  "command": "df -h",
  "status": "completed",
  "output": "Filesystem...",  // Could corrupt JSON
  "stderr": "",
  "exit_code": 0
}
```

**After (new):**
```json
{
  "id": "task_xxx",
  "command": "df -h",
  "status": "completed",
  "output": "Filesystem...",  // Truncated preview (max 500 chars)
  "stderr": "",
  "exit_code": 0,
  "log_num": 0,               // Log file number
  "log_offset": 1234,         // Starting byte offset
  "output_length": 12345,     // Full output length
  "stderr_length": 0          // Full stderr length
}
```

## Implementation

### db-json.js Changes

1. Added `LOG_CONFIG` configuration:
   - `maxLogSize`: 1MB (log file rotation threshold)
   - `keepRotatedLogs`: 5 (number of rotated logs to keep)

2. Added log file functions:
   - `appendToLog(sessionId, taskId, type, content)` - Write to log
   - `readTaskLog(sessionId, taskId, options)` - Read task output from log
   - `searchLogs(sessionId, query, options)` - Search across logs
   - `listLogs(sessionId)` - List log files for session
   - `rotateLogIfNeeded(sessionId)` - Handle log rotation

3. Updated `getTaskOutput(taskId)`:
   - If task has `log_num`, read full output from log file
   - Otherwise, return JSON output (legacy compatibility)

4. Updated `deleteSession(sessionId)`:
   - Also delete log files (`.log` and `.N.log`)

### session_manager.js Changes

1. `executeCommand()`:
   - Write `COMMAND`, `STDOUT`, `STDERR`, `EXIT` to log file
   - Store `log_num`, `log_offset` in task
   - Truncate output in JSON (max 500 chars preview)
   - Store `output_length`, `stderr_length` for reference

2. `executeSudoCommand()`:
   - Same as `executeCommand()`
   - Mask password in log output for security

## Benefits

1. **No JSON Corruption**: Log files are append-only text, safe for any characters
2. **Full Output Preservation**: No truncation, complete output available
3. **Efficient Storage**: Log files are more compact than JSON for large outputs
4. **Standard Tools**: Can use `tail`, `grep`, `less` to view logs
5. **Automatic Rotation**: Logs rotate at 1MB, old logs cleaned up
6. **Backward Compatible**: Legacy tasks still work with JSON output

## Configuration

```javascript
const LOG_CONFIG = {
  maxLogSize: 1024 * 1024,       // 1MB
  keepRotatedLogs: 5             // Keep 5 rotated logs
};
```

## Security Considerations

1. **Password Masking**: In sudo commands, password is replaced with `********` in logs
2. **File Permissions**: Log files use default permissions (can be restricted with `chmod`)
3. **No Sensitive Data in JSON**: Passwords never stored in JSON files

## Migration

No migration needed - the system is backward compatible:
- New tasks use log files automatically
- Legacy tasks continue to use JSON output
- `getTaskOutput()` handles both cases transparently

---

*Created: 2026-04-11*