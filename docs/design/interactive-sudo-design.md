# Interactive Sudo Implementation Design

## Problem Analysis

### Current Architecture

- [`scripts/ssh-skill.js`](../../scripts/ssh-skill.js) - CLI client, sends commands via JSON files
- [`scripts/ssh-skill-manager.js`](../../scripts/ssh-skill-manager.js) - Background process managing SSH connections
- [`scripts/db.js`](../../scripts/db.js) - SQLite storage

### Current Command Execution

```javascript
// ssh-skill-manager.js:162
conn.exec(command, (err, stream) => {
  // stdout/stderr captured and stored
});
```

### The Sudo Challenge

When running `sudo <command>`:
1. sudo prompts for password: `[sudo] password for user: `
2. Password input requires **no echo** (TTY needed)
3. Current `exec()` doesn't allocate PTY by default
4. Need to detect password prompt and respond

## Solution Options

### Option 1: shell() with PTY

```javascript
conn.shell({ cols: 120, rows: 24 }, (err, stream) => {
  stream.write('sudo command\n');
  stream.on('data', (data) => {
    if (data.includes('[sudo] password')) {
      stream.write(password + '\n');
    }
  });
});
```

**Pros:**
- Full interactive shell support
- Proper TTY allocation
- Can handle multiple sudo commands

**Cons:**
- Shell persists, need lifecycle management
- More complex state management
- Output parsing needed

### Option 2: exec() with PTY option ⭐ Recommended

```javascript
conn.exec('sudo command', { 
  pty: { cols: 120, rows: 24 } 
}, (err, stream) => {
  stream.on('data', (data) => {
    if (data.includes('[sudo] password')) {
      stream.write(password + '\n');
    }
  });
  // stream.stdin available for writing
});
```

**Pros:**
- Simpler than shell
- PTY allocated for sudo
- Command terminates after completion
- Compatible with current task model

**Cons:**
- Need prompt detection logic
- Password must be provided

### Option 3: Keyboard-interactive Authentication

Server-side feature, not applicable for client-side sudo.

## Recommended Implementation

### New Command: `sudo`

```bash
node scripts/ssh-skill.js sudo --session ID --command "..." --password "..."
```

### Database Schema Extension

Add `sudo_password` to session config (optional, encrypted):

```sql
ALTER TABLE sessions ADD COLUMN sudo_password TEXT;
```

### Code Changes

#### 1. ssh-skill-manager.js - Add sudo execution

```javascript
async function executeSudoCommand(sessionId, taskId, command, password) {
  const conn = connections.get(sessionId);
  
  const ptyConfig = {
    cols: 120,
    rows: 24,
    term: 'xterm-256color'
  };
  
  conn.exec(command, { pty: ptyConfig }, (err, stream) => {
    let stdout = '';
    let stderr = '';
    let passwordSent = false;
    
    stream.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      
      // Detect sudo password prompt
      if (!passwordSent && /password\s*(for|:)/i.test(chunk)) {
        stream.write(password + '\n');
        passwordSent = true;
      }
      
      // Update task...
    });
    
    stream.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    stream.on('close', (code, signal) => {
      // Complete task...
    });
    
    // Allow writing to stdin
    stream.stdin = stream;
  });
}
```

#### 2. ssh-skill.js - Add sudo CLI command

```javascript
function sudo(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.command) return output({ success: false, error: 'command is required' });
  if (!params.password) return output({ success: false, error: 'password is required for sudo' });
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sudo ${params.command}`);
  
  sendCommand({
    action: 'sudo',
    session_id: sessionId,
    task_id: taskId,
    command: params.command,
    password: params.password
  });
  
  output({ success: true, task_id: taskId });
}
```

#### 3. Add message type for sudo prompts

```javascript
// In db.js message types
type: 'sudo-prompt' | 'sudo-output' | 'sudo-complete'
```

### Prompt Detection Patterns

Common sudo password prompts:

```javascript
const SUDO_PROMPT_PATTERNS = [
  /\[sudo\] password/i,
  /password\s*(for|:)/i,
  /Password:/i,
  /\[sudo\].*password/i
];
```

### Security Considerations

1. **Password Storage**
   - Don't store password in database by default
   - If stored, use encryption
   - Better: require password per command

2. **Password in Memory**
   - Clear password from memory after use
   - Don't log password

3. **Password in Messages**
   - Don't include password in stored messages
   - Mask in output if accidentally echoed

### Alternative: Interactive Input Mode

For more flexibility, add an interactive mode:

```bash
node scripts/ssh-skill.js shell --session ID
```

Opens a bidirectional shell where user can interact directly.

## Implementation Phases

### Phase 1: Basic sudo support
- Add `sudo` command with password parameter
- PTY allocation for sudo commands
- Password prompt detection and response

### Phase 2: Password caching (optional)
- Cache password in memory for session duration
- Auto-resend for subsequent sudo commands

### Phase 3: Interactive shell (future)
- Full interactive shell session
- Real-time bidirectional communication
- Su/sudo support

## API Changes

### New CLI Command

```bash
node scripts/ssh-skill.js sudo \
  --session sess_xxx \
  --command "apt update" \
  --password "user_password"
```

### Output

```json
{
  "success": true,
  "task_id": "task_xxx",
  "message": "Sudo command submitted"
}
```

## Tasks

- [ ] Add `sudo` action handler in ssh-skill-manager.js
- [ ] Add `sudo` CLI command in ssh-skill.js
- [ ] Implement PTY allocation for exec
- [ ] Implement password prompt detection
- [ ] Add tests for sudo functionality
- [ ] Update SKILL.md documentation