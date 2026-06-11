#!/usr/bin/env node
/**
 * SSH Client - Client for the session manager
 *
 * Communicates with the background Session Manager.
 * Uses JSON files for persistent storage (no native dependencies).
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const db = require('./db-json');

// Data directory paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const COMMANDS_DIR = path.join(DATA_DIR, 'commands');
const MANAGER_SCRIPT = path.join(__dirname, 'session_manager.js');

/**
 * Output JSON
 */
function output(result) {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Parse arguments
 */
function parseArgs(args) {
  const result = {};
  let i = 0;
  
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.substring(2).replace(/-/g, '_');
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        result[key] = value;
        i += 2;
      } else {
        result[key] = true;
        i++;
      }
    } else {
      i++;
    }
  }
  
  return result;
}

/**
 * Send command to manager
 * Sets file permissions to 0600 for security
 */
function sendCommand(cmd) {
  const dir = path.dirname(COMMANDS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(COMMANDS_DIR)) {
    fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  }
  
  const cmdId = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const cmdFile = path.join(COMMANDS_DIR, `${cmdId}.json`);
  
  // Write with restrictive permissions (0600 = owner read/write only)
  fs.writeFileSync(cmdFile, JSON.stringify(cmd), { mode: 0o600 });
  
  return cmdId;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for manager PID file and process readiness
 */
async function waitForManagerStart(pidFile, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'));

      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0);
          return { success: true, pid };
        } catch {
          // PID file exists but process is not ready yet or has exited.
        }
      }
    }

    await wait(100);
  }

  return { success: false, error: 'Timed out waiting for manager to start' };
}

/**
 * Start the manager
 */
async function startManager() {
  const { spawn } = require('child_process');
  
  const pidFile = path.join(DATA_DIR, 'manager.pid');
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'));
    try {
      process.kill(pid, 0);
      output({ success: true, message: 'Manager is already running', pid });
      return;
    } catch {
      fs.unlinkSync(pidFile);
    }
  }
  
  const child = spawn('node', [MANAGER_SCRIPT, 'start'], {
    detached: true,
    stdio: 'ignore'
  });
  
  child.unref();

  const childError = new Promise(resolve => {
    child.once('error', err => resolve({ success: false, error: err.message }));
    child.once('exit', code => {
      if (code !== 0 && code !== null) {
        resolve({ success: false, error: `Manager exited early with code ${code}` });
      }
    });
  });

  const result = await Promise.race([
    waitForManagerStart(pidFile, 5000),
    childError
  ]);

  if (result && result.success) {
    output({ success: true, message: 'Manager started', pid: result.pid });
    return;
  }

  output(result || { success: false, error: 'Failed to start manager' });
}

/**
 * Stop the manager
 */
function stopManager() {
  sendCommand({ action: 'shutdown' });
  setTimeout(() => output({ success: true, message: 'Manager stopped' }), 500);
}

/**
 * Validate host format
 */
function validateHost(host) {
  if (!host || typeof host !== 'string') {
    return { valid: false, error: 'host is required' };
  }
  // Basic validation: hostname or IP
  const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/;
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  
  if (!hostnameRegex.test(host) && !ipRegex.test(host)) {
    return { valid: false, error: 'Invalid host format' };
  }
  return { valid: true };
}

/**
 * Validate port number
 */
function validatePort(port) {
  if (port === undefined || port === null) return { valid: true };
  const num = parseInt(port);
  if (isNaN(num) || num < 1 || num > 65535) {
    return { valid: false, error: 'Port must be between 1 and 65535' };
  }
  return { valid: true };
}

/**
 * Read and parse connection config file
 * Supports both JSON and simple key-value format
 */
function readConfigFile(configPath) {
  try {
    const absolutePath = configPath.replace('~', require('os').homedir());
    
    if (!fs.existsSync(absolutePath)) {
      return { error: `Config file not found: ${absolutePath}` };
    }
    
    const content = fs.readFileSync(absolutePath, 'utf-8').trim();
    
    // Try JSON format first
    if (content.startsWith('{') || content.startsWith('[')) {
      try {
        const json = JSON.parse(content);
        return { config: json };
      } catch (e) {
        return { error: `Invalid JSON format: ${e.message}` };
      }
    }
    
    // Parse simple key-value format (key: value or key=value)
    const config = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
        continue;
      }
      
      // Support both colon and equals separator
      const match = trimmed.match(/^([^:=\s]+)\s*[:=]\s*(.*)$/);
      if (match) {
        const key = match[1].trim().replace(/-/g, '_');
        let value = match[2].trim();
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        config[key] = value;
      }
    }
    
    return { config };
  } catch (err) {
    return { error: `Failed to read config file: ${err.message}` };
  }
}

function getSessionConfigOrNull(sessionId) {
  return db.getSessionConfig(sessionId);
}

function normalizeBase64(input) {
  return input.replace(/\s+/g, '');
}

function decodeBase64Command(encoded) {
  const normalized = normalizeBase64(encoded || '');
  if (!normalized) {
    return { error: 'command-base64 is required' };
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    return { error: 'command-base64 must be valid base64' };
  }

  try {
    const buffer = Buffer.from(normalized, 'base64');
    if (buffer.length === 0) {
      return { error: 'command-base64 decoded to empty string' };
    }

    const roundTrip = buffer.toString('base64');
    if (roundTrip !== normalized) {
      return { error: 'command-base64 must be strict base64 without invalid characters' };
    }

    const command = buffer.toString('utf8');
    if (!command) {
      return { error: 'command-base64 decoded to empty string' };
    }

    return { command };
  } catch (err) {
    return { error: `command-base64 decode error: ${err.message}` };
  }
}

function parsePositiveIntOption(value, name) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: `${name} must be a positive integer` };
  }
  return { value: parsed };
}

/**
 * Connect to a server using config file
 */
function connectFromConfig(params) {
  if (!params.config) {
    return output({ success: false, error: '--config option is required' });
  }
  
  const result = readConfigFile(params.config);
  
  if (result.error) {
    return output({ success: false, error: result.error });
  }
  
  const config = result.config;
  
  // Validate required fields
  if (!config.host) {
    return output({ success: false, error: 'host is required in config file' });
  }
  if (!config.username) {
    return output({ success: false, error: 'username is required in config file' });
  }
  
  // Validate format
  const hostValidation = validateHost(config.host);
  if (!hostValidation.valid) {
    return output({ success: false, error: hostValidation.error });
  }
  
  const portValidation = validatePort(config.port);
  if (!portValidation.valid) {
    return output({ success: false, error: portValidation.error });
  }
  
  const sessionId = params.session_id || db.generateId('sess');
  
  const connectionConfig = {
    host: config.host,
    port: parseInt(config.port) || 22,
    username: config.username,
    password: config.password,
    private_key: config.private_key || config.privateKey,
    passphrase: config.passphrase,
    // Save defaultPty config for exec command
    defaultPty: config.defaultPty || null
  };
  
  db.createSession(sessionId, connectionConfig);
  
  sendCommand({
    action: 'connect',
    session_id: sessionId,
    config: connectionConfig
  });
  
  output({
    success: true,
    session_id: sessionId,
    message: `Connection request sent for ${connectionConfig.host}:${connectionConfig.port}`,
    config_source: params.config
  });
}

/**
 * Connect to a server
 */
function connect(params) {
  // If --config option is provided, use config file
  if (params.config) {
    return connectFromConfig(params);
  }
  
  // Validate required parameters
  if (!params.host) {
    return output({ success: false, error: 'host is required' });
  }
  if (!params.username) {
    return output({ success: false, error: 'username is required' });
  }
  
  // Validate format
  const hostValidation = validateHost(params.host);
  if (!hostValidation.valid) {
    return output({ success: false, error: hostValidation.error });
  }
  
  const portValidation = validatePort(params.port);
  if (!portValidation.valid) {
    return output({ success: false, error: portValidation.error });
  }
  
  const sessionId = params.session_id || db.generateId('sess');
  
  const config = {
    host: params.host,
    port: parseInt(params.port) || 22,
    username: params.username,
    password: params.password,
    private_key: params.private_key,
    passphrase: params.passphrase
  };
  
  db.createSession(sessionId, config);
  
  sendCommand({
    action: 'connect',
    session_id: sessionId,
    config
  });
  
  output({
    success: true,
    session_id: sessionId,
    message: `Connection request sent for ${config.host}`
  });
}

/**
 * Execute a command
 */
function exec(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.command && !params.command_base64) return output({ success: false, error: 'command or command-base64 is required' });
  if (params.command && params.command_base64) return output({ success: false, error: 'command and command-base64 are mutually exclusive' });
  
  let finalCommand;
  if (params.command_base64) {
    const decoded = decodeBase64Command(params.command_base64);
    if (decoded.error) return output({ success: false, error: decoded.error });
    finalCommand = decoded.command;
  } else {
    finalCommand = params.command;
  }
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const sessionConfig = getSessionConfigOrNull(sessionId) || {};
  const defaultPty = sessionConfig.defaultPty || {};
  
  // Priority: CLI params > config file defaults > hardcoded defaults
  const ptyConfig = {
    pty: params.pty !== undefined ? params.pty : (defaultPty.enabled || false),
    cols: params.cols ? parseInt(params.cols) : (defaultPty.cols || 120),
    rows: params.rows ? parseInt(params.rows) : (defaultPty.rows || 24),
    term: params.term || defaultPty.term || 'xterm-256color'
  };
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, finalCommand);
  
  sendCommand({
    action: 'exec',
    session_id: sessionId,
    task_id: taskId,
    command: finalCommand,
    pty: ptyConfig.pty,
    cols: ptyConfig.cols,
    rows: ptyConfig.rows,
    term: ptyConfig.term
  });
  
  const submitResult = { submitted: finalCommand, task_id: taskId };
  if (params.command_base64) submitResult.command_base64_submitted = true;
  output(submitResult);
}

/**
 * Read password from file
 * Checks file permissions for security
 */
function readPasswordFile(filePath) {
  try {
    const absolutePath = filePath.replace('~', require('os').homedir());
    if (!fs.existsSync(absolutePath)) {
      return null;
    }
    
    // Check file permissions (warn if too open)
    const stat = fs.statSync(absolutePath);
    const mode = stat.mode & 0o777;
    if (mode & 0o077) { // Others or group can read
      console.error(`WARNING: Password file ${absolutePath} has overly permissive permissions (${mode.toString(8)})`);
      console.error('Recommended: chmod 600', absolutePath);
    }
    
    const content = fs.readFileSync(absolutePath, 'utf-8').trim();
    return content || null;
  } catch (err) {
    return null;
  }
}

/**
 * Prompt for password interactively (hidden input)
 * Uses try-finally to ensure terminal state is restored
 */
async function promptPassword(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    let rawModeEnabled = false;
    
    const cleanup = () => {
      if (rawModeEnabled) {
        try {
          process.stdin.setRawMode(false);
        } catch (e) { /* ignore */ }
      }
      process.stdin.pause();
      rl.close();
    };
    
    try {
      // Hide input
      process.stdout.write(promptText);
      process.stdin.setRawMode(true);
      rawModeEnabled = true;
      process.stdin.resume();
      
      let password = '';
      
      const onData = (char) => {
        const c = char.toString('utf-8');
        switch (c) {
          case '\n':
          case '\r':
          case '\u0004': // Ctrl-D
            cleanup();
            process.stdout.write('\n');
            resolve(password);
            break;
          case '\u0003': // Ctrl-C
            cleanup();
            process.stdout.write('\n');
            process.exit(130); // 128 + SIGINT
            break;
          case '\u007F': // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
            }
            break;
          default:
            password += c;
            break;
        }
      };
      
      process.stdin.on('data', onData);
      
    } catch (err) {
      cleanup();
      resolve('');
    }
  });
}

/**
 * Get password from various sources (priority: file > env > interactive > cached)
 */
async function getPassword(params) {
  // 1. From password file (highest priority for scripting)
  if (params.password_file) {
    const pw = readPasswordFile(params.password_file);
    if (pw) return { password: pw, source: 'file' };
    return { error: `Password file not found or empty: ${params.password_file}` };
  }
  
  // 2. From environment variable
  if (process.env.SUDO_PASSWORD) {
    return { password: process.env.SUDO_PASSWORD, source: 'env' };
  }
  
  // 3. Interactive prompt (if tty)
  if (process.stdin.isTTY) {
    const password = await promptPassword('[sudo] Password: ');
    if (password) {
      return { password, source: 'interactive' };
    }
  }
  
  // 4. Return null to let session manager use cached password
  return { password: null, source: 'cached' };
}

/**
 * Execute a sudo command with password
 *
 * Password sources (in order of priority):
 * 1. --password-file FILE   Read from file (most secure for scripting)
 * 2. SUDO_PASSWORD env      Environment variable
 * 3. Interactive prompt     Hidden input from terminal
 *
 * NOTE: --password CLI arg is DEPRECATED and ignored for security reasons
 */
async function sudo(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.command) return output({ success: false, error: 'command is required' });
  
  // Warn if using deprecated --password parameter
  if (params.password) {
    console.error('WARNING: --password CLI argument is deprecated and ignored for security reasons.');
    console.error('Use one of: --password-file, SUDO_PASSWORD env, interactive mode, or cached password from session.');
  }
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  // Get password from secure sources (may return null to use cached password)
  const pwResult = await getPassword(params);
  if (pwResult.error) {
    return output({ success: false, error: pwResult.error });
  }
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sudo ${params.command}`);
  
  // Send command with password (null means use cached password from session)
  sendCommand({
    action: 'sudo',
    session_id: sessionId,
    task_id: taskId,
    command: params.command,
    password: pwResult.password  // may be null, session manager will use cached password
  });
  
  output({ submitted: `sudo ${params.command}`, task_id: taskId });
}

/**
 * Read session messages
 */
function read(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const messages = db.queryMessages(sessionId, {
    since: params.since,
    until: params.until,
    type: params.type,
    taskId: params.task,
    unreadOnly: params.unread_only,
    limit: params.limit ? parseInt(params.limit) : undefined,
    offset: params.offset ? parseInt(params.offset) : undefined,
    reverse: params.reverse
  });
  
  if (params.mark_read && messages.length > 0) {
    db.markAsRead(sessionId, { messageIds: messages.map(m => m.id) });
  }
  
  output({
    success: true,
    session_id: sessionId,
    status: session.status,
    unread_count: session.unread_count,
    message_count: messages.length,
    messages
  });
}

/**
 * Get command history
 */
function history(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const limit = params.limit ? parseInt(params.limit) : 50;
  const commands = db.getCommandHistory(sessionId, limit);
  
  output({
    success: true,
    session_id: sessionId,
    count: commands.length,
    commands
  });
}

/**
 * Search messages
 */
function search(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.query) return output({ success: false, error: 'query is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const messages = db.searchMessages(sessionId, params.query, {
    type: params.type,
    limit: params.limit ? parseInt(params.limit) : 50
  });
  
  output({
    success: true,
    session_id: sessionId,
    query: params.query,
    count: messages.length,
    messages
  });
}

/**
 * Get session statistics
 */
function stats(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  
  const stats = db.getSessionStats(sessionId);
  if (!stats) return output({ success: false, error: 'Session not found' });
  
  output({ success: true, stats });
}

/**
 * Mark messages as read
 */
function markRead(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  let result;
  if (params.all) {
    result = db.markAsRead(sessionId, { all: true });
  } else if (params.before) {
    result = db.markAsRead(sessionId, { beforeTimestamp: params.before });
  } else {
    result = db.markAsRead(sessionId, { all: true });
  }
  
  output({
    success: true,
    session_id: sessionId,
    marked_count: result.marked_count,
    unread_count: result.unread_count
  });
}

/**
 * Get task output (detailed)
 */
function taskOutput(params) {
  const taskId = params.task;

  if (!taskId) return output({ success: false, error: 'task is required' });
  if (params.full && (params.tail || params.head)) return output({ success: false, error: 'full cannot be combined with tail or head' });
  if (params.tail && params.head) return output({ success: false, error: 'tail and head are mutually exclusive' });

  const options = {};
  if (params.full) {
    // no tail/head, return complete output
  } else if (params.tail) {
    const parsed = parsePositiveIntOption(params.tail, 'tail');
    if (parsed.error) return output({ success: false, error: parsed.error });
    options.tail = parsed.value;
  } else if (params.head) {
    const parsed = parsePositiveIntOption(params.head, 'head');
    if (parsed.error) return output({ success: false, error: parsed.error });
    options.head = parsed.value;
  }

  const taskOutput = db.getTaskOutput(taskId, options);
  if (!taskOutput) return output({ success: false, error: 'Task not found' });

  const result = {
    status: taskOutput.status,
    exit_code: taskOutput.exit_code,
    output: taskOutput.output,
    stderr: taskOutput.stderr,
    output_length: taskOutput.output_length,
    stderr_length: taskOutput.stderr_length
  };
  if (taskOutput.stdout_head_truncated) result.stdout_head_truncated = true;
  if (taskOutput.stdout_tail_truncated) result.stdout_tail_truncated = true;
  if (taskOutput.stderr_head_truncated) result.stderr_head_truncated = true;
  if (taskOutput.stderr_tail_truncated) result.stderr_tail_truncated = true;

  output(result);
}

/**
 * Get task status (summary)
 */
function taskStatus(params) {
  const taskId = params.task;
  
  if (!taskId) return output({ success: false, error: 'task is required' });
  
  const task = db.getTask(taskId);
  if (!task) return output({ success: false, error: 'Task not found' });
  
  const result = { 
    success: true,
    task_id: task.id,
    session_id: task.session_id,
    command: task.command,
    status: task.status,
    exit_code: task.exit_code,
    created_at: task.created_at
  };

  if (task.log_num !== undefined) {
    result.log_num = task.log_num;
    try {
      const fsc = require('fs');
      const logPath = db.getLogFilePath(task.session_id, task.log_num);
      if (fsc.existsSync(logPath)) {
        result.log_size = fsc.statSync(logPath).size;
      }
    } catch (_) {}
  }
  
  output(result);
}

/**
 * List tasks
 */
function listTasks(params) {
  const tasks = db.listTasks(params.session);
  output({ success: true, count: tasks.length, tasks });
}

/**
 * Reconnect to a disconnected session
 */
function reconnect(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  if (session.status === 'connected') {
    return output({ success: false, error: 'Session is already connected' });
  }
  
  const sessionConfig = getSessionConfigOrNull(sessionId);
  if (!sessionConfig) {
    return output({ success: false, error: 'Session config not found, cannot reconnect' });
  }
  
  // Send connect command with existing config
  sendCommand({
    action: 'connect',
    session_id: sessionId,
    config: sessionConfig
  });
  
  db.updateSessionStatus(sessionId, 'connecting');
  
  output({
    success: true,
    session_id: sessionId,
    message: `Reconnecting to ${session.host}`
  });
}

/**
 * Disconnect from a server
 */
function disconnect(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  
  sendCommand({ action: 'disconnect', session_id: sessionId });
  db.updateSessionStatus(sessionId, 'disconnected');
  
  output({ success: true, message: `Disconnect request sent for ${sessionId}` });
}

/**
 * Delete a session
 */
function deleteSession(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  
  db.deleteSession(sessionId);
  
  output({ success: true, message: `Session ${sessionId} deleted` });
}

/**
 * List all sessions
 */
function list() {
  const sessions = db.listSessions();
  output({ success: true, count: sessions.length, sessions });
}

// ==================== SFTP Commands ====================

/**
 * SFTP List directory
 */
function sftpList(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.path) return output({ success: false, error: 'path is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sftp-list ${params.path}`);
  
  sendCommand({
    action: 'sftp_list',
    session_id: sessionId,
    task_id: taskId,
    path: params.path
  });
  
  output({ submitted: `sftp-list ${params.path}`, task_id: taskId });
}

/**
 * SFTP Download file
 */
function sftpDownload(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.remote) return output({ success: false, error: 'remote path is required (--remote)' });
  if (!params.local) return output({ success: false, error: 'local path is required (--local)' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sftp-download ${params.remote} -> ${params.local}`);
  
  sendCommand({
    action: 'sftp_download',
    session_id: sessionId,
    task_id: taskId,
    remote: params.remote,
    local: params.local
  });
  
  output({ submitted: `sftp-download ${params.remote} -> ${params.local}`, task_id: taskId });
}

/**
 * SFTP Upload file
 */
function sftpUpload(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.local) return output({ success: false, error: 'local path is required (--local)' });
  if (!params.remote) return output({ success: false, error: 'remote path is required (--remote)' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sftp-upload ${params.local} -> ${params.remote}`);
  
  sendCommand({
    action: 'sftp_upload',
    session_id: sessionId,
    task_id: taskId,
    local: params.local,
    remote: params.remote
  });
  
  output({ submitted: `sftp-upload ${params.local} -> ${params.remote}`, task_id: taskId });
}

/**
 * SFTP Stat (get file info)
 */
function sftpStat(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.path) return output({ success: false, error: 'path is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sftp-stat ${params.path}`);
  
  sendCommand({
    action: 'sftp_stat',
    session_id: sessionId,
    task_id: taskId,
    path: params.path
  });
  
  output({ submitted: `sftp-stat ${params.path}`, task_id: taskId });
}

/**
 * SFTP Mkdir (create directory)
 */
function sftpMkdir(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.path) return output({ success: false, error: 'path is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sftp-mkdir ${params.path}`);
  
  sendCommand({
    action: 'sftp_mkdir',
    session_id: sessionId,
    task_id: taskId,
    path: params.path
  });
  
  output({ submitted: `sftp-mkdir ${params.path}`, task_id: taskId });
}

/**
 * SFTP Rmdir (remove directory)
 */
function sftpRmdir(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.path) return output({ success: false, error: 'path is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sftp-rmdir ${params.path}`);
  
  sendCommand({
    action: 'sftp_rmdir',
    session_id: sessionId,
    task_id: taskId,
    path: params.path
  });
  
  output({ submitted: `sftp-rmdir ${params.path}`, task_id: taskId });
}

/**
 * SFTP Delete (remove file)
 */
function sftpDelete(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.path) return output({ success: false, error: 'path is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sftp-delete ${params.path}`);
  
  sendCommand({
    action: 'sftp_delete',
    session_id: sessionId,
    task_id: taskId,
    path: params.path
  });
  
  output({ submitted: `sftp-delete ${params.path}`, task_id: taskId });
}

/**
 * SFTP Rename (rename/move file)
 */
function sftpRename(params) {
  const sessionId = params.session;
  
  if (!sessionId) return output({ success: false, error: 'session is required' });
  if (!params.old_path && !params.old) return output({ success: false, error: 'old path is required (--old-path)' });
  if (!params.new_path && !params.new) return output({ success: false, error: 'new path is required (--new-path)' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const oldPath = params.old_path || params.old;
  const newPath = params.new_path || params.new;
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, `sftp-rename ${oldPath} -> ${newPath}`);
  
  sendCommand({
    action: 'sftp_rename',
    session_id: sessionId,
    task_id: taskId,
    old_path: oldPath,
    new_path: newPath
  });
  
  output({ submitted: `sftp-rename ${oldPath} -> ${newPath}`, task_id: taskId });
}

/**
 * Show help
 */
function help() {
  console.log('SSH Client - Session-based SSH client (JSON storage)');
  console.log('');
  console.log('Usage: node ssh_client.js <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  start-manager      Start the background session manager');
  console.log('  stop-manager       Stop the background session manager');
  console.log('  connect            Connect to a server');
  console.log('  exec               Execute a command');
  console.log('  sudo               Execute a sudo command with password');
  console.log('  read               Read messages');
  console.log('  history            Get command history (list with task_id)');
  console.log('  output             Get task output (detailed)');
  console.log('  search             Search messages');
  console.log('  stats              Get session statistics');
  console.log('  mark-read          Mark messages as read');
  console.log('  task-status        Get task status (summary)');
  console.log('  tasks              List tasks');
  console.log('  reconnect          Reconnect a disconnected session');
  console.log('  disconnect         Disconnect from server');
  console.log('  delete             Delete a session');
  console.log('  list               List all sessions');
  console.log('');
  console.log('SFTP Commands:');
  console.log('  sftp-list          List remote directory contents');
  console.log('  sftp-download      Download file from remote server');
  console.log('  sftp-upload        Upload file to remote server');
  console.log('  sftp-stat          Get file/directory information');
  console.log('  sftp-mkdir         Create remote directory');
  console.log('  sftp-rmdir         Remove remote directory');
  console.log('  sftp-delete        Delete remote file');
  console.log('  sftp-rename        Rename/move remote file');
  console.log('');
  console.log('Storage: ./data/sessions/ (JSON files)');
  console.log('');
  console.log('Connect Options:');
  console.log('  --host HOST            Server hostname or IP');
  console.log('  --port PORT            Server port (default: 22)');
  console.log('  --username USER        Username for authentication');
  console.log('  --password PASS        Password for authentication');
  console.log('  --private-key KEY      Path to private key file');
  console.log('  --passphrase PHRASE    Passphrase for private key');
  console.log('  --config FILE          Read connection config from file (JSON or key-value format)');
  console.log('');
  console.log('Exec Options:');
  console.log('  --command CMD          Command to execute on remote server');
  console.log('  --command-base64 B64   Command to execute, base64-encoded (avoids shell quoting issues)');
  console.log('  --pty                  Allocate a pseudo-terminal (for interactive programs)');
  console.log('  --cols N               Terminal width in columns (default: 120)');
  console.log('  --rows N               Terminal height in rows (default: 24)');
  console.log('  --term TERM            Terminal type (default: xterm-256color)');
  console.log('');
  console.log('Output Options:');
  console.log('  --tail N               Return last N characters of output');
  console.log('  --head N               Return first N characters of output');
  console.log('  --full                 Return complete output (default behavior)');
  console.log('');
  console.log('Sudo Password Options (in order of priority):');
  console.log('  --password-file FILE   Read password from file');
  console.log('  SUDO_PASSWORD env      Set environment variable');
  console.log('  (interactive)          Will prompt if TTY available');
  console.log('  (cached)               Use password from SSH connection (automatic)');
  console.log('');
  console.log('SFTP Options:');
  console.log('  --session ID           Session ID (required for all SFTP commands)');
  console.log('  --path PATH            Remote path (for list, stat, mkdir, rmdir, delete)');
  console.log('  --remote PATH          Remote file path (for download/upload)');
  console.log('  --local PATH           Local file path (for download/upload)');
  console.log('  --old-path PATH        Old path (for rename)');
  console.log('  --new-path PATH        New path (for rename)');
  console.log('');
  console.log('Config File Format (JSON):');
  console.log('  {');
  console.log('    "host": "example.com",');
  console.log('    "port": 22,');
  console.log('    "username": "admin",');
  console.log('    "password": "secret",');
  console.log('    "privateKey": "~/.ssh/id_rsa",');
  console.log('    "passphrase": "key_passphrase",');
  console.log('    "defaultPty": {');
  console.log('      "enabled": true,');
  console.log('      "cols": 120,');
  console.log('      "rows": 24,');
  console.log('      "term": "xterm-256color"');
  console.log('    }');
  console.log('  }');
  console.log('');
  console.log('Config File Format (Key-Value):');
  console.log('  host: example.com');
  console.log('  port: 22');
  console.log('  username: admin');
  console.log('  password: secret');
  console.log('');
  console.log('Examples:');
  console.log('  node ssh_client.js start-manager');
  console.log('  node ssh_client.js connect --host 192.168.1.100 --username admin');
  console.log('  node ssh_client.js connect --config ./hosts/server.json');
  console.log('  node ssh_client.js exec --session sess_xxx --command "df -h"');
  console.log('  node ssh_client.js exec --session sess_xxx --command "screen -ls" --pty');
  console.log('  node ssh_client.js exec --session sess_xxx --command "top -b -n 1"');
  console.log('  node ssh_client.js sudo --session sess_xxx --command "apt update"');
  console.log('  SUDO_PASSWORD="secret" node ssh_client.js sudo --session sess_xxx --command "apt update"');
  console.log('  node ssh_client.js sudo --session sess_xxx --command "apt update" --password-file ~/.sudo_pw');
  console.log('  node ssh_client.js history --session sess_xxx');
  console.log('  node ssh_client.js output --task task_xxx');
  console.log('  node ssh_client.js output --task task_xxx --tail 2000');
  console.log('  node ssh_client.js output --task task_xxx --head 1000');
  console.log('  node ssh_client.js exec --session sess_xxx --command-base64 ZGYgLWg=');
  console.log('');
  console.log('SFTP Examples:');
  console.log('  node ssh_client.js sftp-list --session sess_xxx --path /home/user');
  console.log('  node ssh_client.js sftp-download --session sess_xxx --remote /etc/config.yml --local ./config.yml');
  console.log('  node ssh_client.js sftp-upload --session sess_xxx --local ./app.js --remote /home/user/app.js');
  console.log('  node ssh_client.js sftp-stat --session sess_xxx --path /home/user/file.txt');
  console.log('  node ssh_client.js sftp-mkdir --session sess_xxx --path /home/user/newdir');
  console.log('  node ssh_client.js sftp-delete --session sess_xxx --path /home/user/oldfile.txt');
  console.log('  node ssh_client.js sftp-rename --session sess_xxx --old-path /home/user/old.txt --new-path /home/user/new.txt');
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    help();
    return;
  }
  
  const command = args[0];
  const params = parseArgs(args.slice(1));
  
  switch (command) {
    case 'start-manager': await startManager(); break;
    case 'stop-manager': stopManager(); break;
    case 'connect': connect(params); break;
    case 'exec': exec(params); break;
    case 'sudo': await sudo(params); break;  // async
    case 'read': read(params); break;
    case 'history': history(params); break;
    case 'output': taskOutput(params); break;
    case 'search': search(params); break;
    case 'stats': stats(params); break;
    case 'mark-read': markRead(params); break;
    case 'task-status': taskStatus(params); break;
    case 'tasks': listTasks(params); break;
    case 'reconnect': reconnect(params); break;
    case 'disconnect': disconnect(params); break;
    case 'delete': deleteSession(params); break;
    case 'list': list(); break;
    // SFTP commands
    case 'sftp-list': sftpList(params); break;
    case 'sftp-download': sftpDownload(params); break;
    case 'sftp-upload': sftpUpload(params); break;
    case 'sftp-stat': sftpStat(params); break;
    case 'sftp-mkdir': sftpMkdir(params); break;
    case 'sftp-rmdir': sftpRmdir(params); break;
    case 'sftp-delete': sftpDelete(params); break;
    case 'sftp-rename': sftpRename(params); break;
    case 'help':
    case '--help': help(); break;
    default: output({ success: false, error: `Unknown command: ${command}` });
  }
}

main().catch(err => output({ success: false, error: err.message }));
