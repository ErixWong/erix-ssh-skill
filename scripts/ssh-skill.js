#!/usr/bin/env node
/**
 * SSH Skill CLI - Client for the session manager
 * 
 * Communicates with the background SSH Skill Manager.
 * Uses SQLite for persistent storage.
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');

// Data directory paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const COMMANDS_DIR = path.join(DATA_DIR, 'commands');
const MANAGER_SCRIPT = path.join(__dirname, 'ssh-skill-manager.js');

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
  
  fs.writeFileSync(cmdFile, JSON.stringify(cmd));
  
  return cmdId;
}

/**
 * Start the manager
 */
function startManager() {
  const { spawn } = require('child_process');
  
  const pidFile = path.join(os.homedir(), '.ssh-skill', 'manager.pid');
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
  
  setTimeout(() => {
    if (fs.existsSync(pidFile)) {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'));
      output({ success: true, message: 'Manager started', pid });
    } else {
      output({ success: false, error: 'Failed to start manager' });
    }
  }, 500);
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
 * Connect to a server
 */
function connect(params) {
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
  if (!params.command) return output({ success: false, error: 'command is required' });
  
  const session = db.getSession(sessionId);
  if (!session) return output({ success: false, error: 'Session not found' });
  
  const taskId = db.generateId('task');
  db.createTask(taskId, sessionId, params.command);
  
  sendCommand({
    action: 'exec',
    session_id: sessionId,
    task_id: taskId,
    command: params.command
  });
  
  output({ success: true, task_id: taskId, message: 'Command submitted' });
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
  
  const taskOutput = db.getTaskOutput(taskId);
  if (!taskOutput) return output({ success: false, error: 'Task not found' });
  
  output({ success: true, ...taskOutput });
}

/**
 * Get task status (summary)
 */
function taskStatus(params) {
  const taskId = params.task;
  
  if (!taskId) return output({ success: false, error: 'task is required' });
  
  const task = db.getTask(taskId);
  if (!task) return output({ success: false, error: 'Task not found' });
  
  output({ 
    success: true,
    task_id: task.id,
    session_id: task.session_id,
    command: task.command,
    status: task.status,
    exit_code: task.exit_code,
    created_at: task.created_at,
    has_output: task.output && task.output.length > 0,
    has_error: task.stderr && task.stderr.length > 0
  });
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
  
  if (!session.config) {
    return output({ success: false, error: 'Session config not found, cannot reconnect' });
  }
  
  // Send connect command with existing config
  sendCommand({
    action: 'connect',
    session_id: sessionId,
    config: session.config
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

/**
 * Show help
 */
function help() {
  console.log('SSH Skill - Session-based SSH client (SQLite storage)');
  console.log('');
  console.log('Usage: node ssh-skill.js <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  start-manager      Start the background manager');
  console.log('  stop-manager       Stop the background manager');
  console.log('  connect            Connect to a server');
  console.log('  exec               Execute a command');
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
  console.log('Storage: ~/.ssh-skill/ssh-skill.db (SQLite)');
  console.log('');
  console.log('Examples:');
  console.log('  node ssh-skill.js start-manager');
  console.log('  node ssh-skill.js connect --host 192.168.1.100 --username admin');
  console.log('  node ssh-skill.js exec --session sess_xxx --command "df -h"');
  console.log('  node ssh-skill.js history --session sess_xxx');
  console.log('  node ssh-skill.js output --task task_xxx');
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
    case 'start-manager': startManager(); break;
    case 'stop-manager': stopManager(); break;
    case 'connect': connect(params); break;
    case 'exec': exec(params); break;
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
    case 'help':
    case '--help': help(); break;
    default: output({ success: false, error: `Unknown command: ${command}` });
  }
}

main().catch(err => output({ success: false, error: err.message }));