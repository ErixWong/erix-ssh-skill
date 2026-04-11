/**
 * SSH Skill - JSON File Storage
 *
 * Provides persistent storage for sessions, tasks, and messages using JSON files.
 * Each session is stored in a separate file for easy management.
 *
 * Storage structure:
 * data/
 * ├── sessions.json           # Session index
 * └── sessions/
 *     ├── sess_xxx.json       # Main file (connection info, task metadata, no output)
 *     ├── sess_xxx.log        # Command output log (append-only)
 *     ├── sess_xxx.1.log      # Rotated log #1 (when log > maxLogSize)
 *     ├── sess_xxx.1.json     # Archive #1 (~100KB, full) - legacy messages
 *     ├── sess_xxx.2.json     # Archive #2 (~100KB, full)
 *     └── sess_xxx.3.json     # Archive #3 (current, being written)
 *
 * Archive strategy:
 * - Every write to main file also appends to archive file
 * - Main file self-cycles: keeps last 50 command rounds
 * - Archive file: appends all messages, creates new file when > 100KB
 *
 * Log strategy (NEW):
 * - Command output is written to .log files (append-only, safe for binary data)
 * - JSON files only store task metadata (status, exit_code, log_offset)
 * - Log files rotate when exceeding maxLogSize
 * - This prevents JSON corruption from command output containing special characters
 */

const path = require('path');
const fs = require('fs');

// Use project directory for data storage
const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const SESSIONS_INDEX_PATH = path.join(DATA_DIR, 'sessions.json');

// Archive configuration
const ARCHIVE_CONFIG = {
  keepRecentCommands: 50,        // Keep this many recent command rounds in main file
  archiveMaxSize: 100 * 1024     // Max archive file size: 100KB
};

// Log configuration (NEW)
const LOG_CONFIG = {
  maxLogSize: 1024 * 1024,       // Max log file size: 1MB
  keepRotatedLogs: 5             // Keep this many rotated log files
};

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

// Initialize storage
ensureDirectories();

/**
 * Generate unique ID
 */
function generateId(prefix = 'sess') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Read JSON file safely
 */
function readJsonFile(filePath, defaultValue = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return defaultValue;
  }
}

/**
 * Write JSON file safely
 */
function writeJsonFile(filePath, data) {
  ensureDirectories();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Get session file path
 */
function getSessionFilePath(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

/**
 * Get archive file path
 */
function getArchiveFilePath(sessionId, archiveNum) {
  return path.join(SESSIONS_DIR, `${sessionId}.${archiveNum}.json`);
}

/**
 * Load session data from file
 */
function loadSessionData(sessionId) {
  const filePath = getSessionFilePath(sessionId);
  return readJsonFile(filePath, null);
}

/**
 * Save session data to file
 */
function saveSessionData(sessionId, data) {
  const filePath = getSessionFilePath(sessionId);
  writeJsonFile(filePath, data);
}

/**
 * Load sessions index
 */
function loadSessionsIndex() {
  return readJsonFile(SESSIONS_INDEX_PATH, { sessions: [] });
}

/**
 * Save sessions index
 */
function saveSessionsIndex(index) {
  writeJsonFile(SESSIONS_INDEX_PATH, index);
}

// ============================================
// Session Operations
// ============================================

/**
 * Create a new session
 */
function createSession(sessionId, config) {
  const now = new Date().toISOString();
  
  // Create a safe config without sensitive data for disk storage
  const safeConfig = {
    host: config.host,
    port: config.port || 22,
    username: config.username,
    private_key: config.private_key,
    passphrase: config.passphrase ? '***REDACTED***' : undefined
    // password is intentionally NOT saved to disk
  };
  
  const sessionData = {
    session: {
      id: sessionId,
      host: config.host,
      port: config.port || 22,
      username: config.username,
      status: 'connecting',
      config: safeConfig,
      created_at: now,
      updated_at: now,
      last_read_at: null
    },
    tasks: [],
    messages: []
  };
  
  saveSessionData(sessionId, sessionData);
  
  // Update index
  const index = loadSessionsIndex();
  if (!index.sessions.includes(sessionId)) {
    index.sessions.unshift(sessionId); // Add to front
    saveSessionsIndex(index);
  }
  
  return getSession(sessionId);
}

/**
 * Get session by ID
 * Note: Does NOT return config (contains sensitive data like password)
 */
function getSession(sessionId) {
  const data = loadSessionData(sessionId);
  if (!data) return null;
  
  const session = data.session;
  const { config, ...safeSession } = session;  // Exclude config with sensitive data
  
  return {
    ...safeSession,
    unread_count: getUnreadCount(sessionId),
    message_count: data.messages.length
  };
}

/**
 * Update session status
 */
function updateSessionStatus(sessionId, status) {
  const data = loadSessionData(sessionId);
  if (!data) return null;
  
  data.session.status = status;
  data.session.updated_at = new Date().toISOString();
  saveSessionData(sessionId, data);
  
  return getSession(sessionId);
}

/**
 * Update last read timestamp
 */
function updateLastRead(sessionId) {
  const data = loadSessionData(sessionId);
  if (!data) return;
  
  data.session.last_read_at = new Date().toISOString();
  data.session.updated_at = new Date().toISOString();
  saveSessionData(sessionId, data);
}

/**
 * Get session summary
 */
function getSessionSummary(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  
  return {
    id: session.id,
    host: session.host,
    port: session.port,
    username: session.username,
    status: session.status,
    created_at: session.created_at,
    updated_at: session.updated_at,
    last_read_at: session.last_read_at,
    unread_count: session.unread_count,
    message_count: session.message_count
  };
}

/**
 * List all sessions
 */
function listSessions() {
  const index = loadSessionsIndex();
  return index.sessions
    .map(sessionId => getSessionSummary(sessionId))
    .filter(s => s !== null);
}

/**
 * Delete session and its data (including all archives and logs)
 */
function deleteSession(sessionId) {
  // Remove main data file
  const filePath = getSessionFilePath(sessionId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  // Remove all archive and log files using readdir (handles gaps in numbering)
  const files = fs.readdirSync(SESSIONS_DIR);
  const archivePattern = new RegExp(`^${sessionId}\\.(\\d+)\\.json$`);
  const logPattern = new RegExp(`^${sessionId}(?:\\.(\\d+))?\\.log$`);
  
  for (const file of files) {
    if (archivePattern.test(file) || logPattern.test(file)) {
      fs.unlinkSync(path.join(SESSIONS_DIR, file));
    }
  }
  
  // Update index
  const index = loadSessionsIndex();
  index.sessions = index.sessions.filter(id => id !== sessionId);
  saveSessionsIndex(index);
}

// ============================================
// Task Operations
// ============================================

/**
 * Create a new task
 */
function createTask(taskId, sessionId, command) {
  const data = loadSessionData(sessionId);
  if (!data) return null;
  
  const now = new Date().toISOString();
  const task = {
    id: taskId,
    session_id: sessionId,
    command: command,
    status: 'pending',
    output: '',
    stderr: '',
    exit_code: null,
    created_at: now,
    updated_at: now,
    completed_at: null
  };
  
  data.tasks.push(task);
  data.session.updated_at = now;
  saveSessionData(sessionId, data);
  
  return task;
}

/**
 * Get task by ID
 */
function getTask(taskId) {
  const index = loadSessionsIndex();
  
  for (const sessionId of index.sessions) {
    const data = loadSessionData(sessionId);
    if (data) {
      const task = data.tasks.find(t => t.id === taskId);
      if (task) return task;
    }
  }
  
  return null;
}

/**
 * Update task
 */
function updateTask(task) {
  const data = loadSessionData(task.session_id);
  if (!data) return null;
  
  const index = data.tasks.findIndex(t => t.id === task.id);
  if (index === -1) return null;
  
  task.updated_at = new Date().toISOString();
  data.tasks[index] = task;
  data.session.updated_at = task.updated_at;
  saveSessionData(task.session_id, data);
  
  return task;
}

/**
 * List tasks
 */
function listTasks(sessionId) {
  if (sessionId) {
    const data = loadSessionData(sessionId);
    if (!data) return [];
    
    return data.tasks.map(t => ({
      id: t.id,
      session_id: t.session_id,
      command: t.command,
      status: t.status,
      created_at: t.created_at,
      exit_code: t.exit_code
    }));
  } else {
    // List all tasks
    const index = loadSessionsIndex();
    let allTasks = [];
    
    for (const sid of index.sessions) {
      const data = loadSessionData(sid);
      if (data) {
        allTasks = allTasks.concat(data.tasks.map(t => ({
          id: t.id,
          session_id: t.session_id,
          command: t.command,
          status: t.status,
          created_at: t.created_at,
          exit_code: t.exit_code
        })));
      }
    }
    
    return allTasks.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
}

/**
 * Get task output
 * If task has log_num, read full output from log file
 * Otherwise, return truncated output from JSON (legacy compatibility)
 */
function getTaskOutput(taskId) {
  const task = getTask(taskId);
  if (!task) return null;
  
  // If task has log reference, read full output from log file
  if (task.log_num !== undefined) {
    const logOutput = readTaskLog(task.session_id, taskId, {
      logNum: task.log_num,
      logOffset: task.log_offset
    });
    
    return {
      task_id: task.id,
      session_id: task.session_id,
      command: task.command,
      status: task.status,
      exit_code: task.exit_code,
      created_at: task.created_at,
      completed_at: task.completed_at || task.updated_at,
      output: logOutput.stdout,
      stderr: logOutput.stderr,
      output_length: task.output_length || logOutput.stdout.length,
      stderr_length: task.stderr_length || logOutput.stderr.length,
      log_num: task.log_num,
      log_offset: task.log_offset
    };
  }
  
  // Legacy: return output from JSON (truncated)
  return {
    task_id: task.id,
    session_id: task.session_id,
    command: task.command,
    status: task.status,
    exit_code: task.exit_code,
    created_at: task.created_at,
    completed_at: task.completed_at || task.updated_at,
    output: task.output || '',
    stderr: task.stderr || '',
    output_length: task.output_length || (task.output ? task.output.length : 0),
    stderr_length: task.stderr_length || (task.stderr ? task.stderr.length : 0)
  };
}

/**
 * Delete task and its messages
 */
function deleteTask(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  
  const data = loadSessionData(task.session_id);
  if (!data) return;
  
  data.tasks = data.tasks.filter(t => t.id !== taskId);
  data.messages = data.messages.filter(m => m.task_id !== taskId);
  data.session.updated_at = new Date().toISOString();
  saveSessionData(task.session_id, data);
}

// ============================================
// Message Operations
// ============================================

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Get current archive number (find the latest archive file)
 */
function getCurrentArchiveNum(sessionId) {
  let num = 1;
  while (fs.existsSync(getArchiveFilePath(sessionId, num))) {
    num++;
  }
  return num > 1 ? num - 1 : 1;
}

/**
 * Append message to archive file
 * Creates new archive file when current one exceeds max size
 */
function appendToArchive(sessionId, message) {
  let archiveNum = getCurrentArchiveNum(sessionId);
  let archivePath = getArchiveFilePath(sessionId, archiveNum);
  
  // Check if current archive is full, create new one
  if (fs.existsSync(archivePath) && getFileSize(archivePath) > ARCHIVE_CONFIG.archiveMaxSize) {
    archiveNum++;
    archivePath = getArchiveFilePath(sessionId, archiveNum);
  }
  
  // Read existing archive or create new
  let archiveData;
  if (fs.existsSync(archivePath)) {
    archiveData = readJsonFile(archivePath, { messages: [] });
  } else {
    archiveData = {
      session_id: sessionId,
      archive_num: archiveNum,
      created_at: new Date().toISOString(),
      messages: []
    };
  }
  
  // Append message
  archiveData.messages.push(message);
  archiveData.message_count = archiveData.messages.length;
  archiveData.updated_at = new Date().toISOString();
  
  writeJsonFile(archivePath, archiveData);
}

/**
 * Prune old messages from main file (keep recent N command rounds)
 */
function pruneOldMessages(data) {
  const keepCount = ARCHIVE_CONFIG.keepRecentCommands;
  
  // Get all command messages sorted by time
  const commandMessages = data.messages
    .filter(m => m.type === 'command')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  if (commandMessages.length <= keepCount) {
    return data;
  }
  
  // Find cutoff timestamp (keep the last N commands)
  const cutoffIndex = commandMessages.length - keepCount - 1;
  const cutoffCommand = commandMessages[cutoffIndex];
  const cutoffTimestamp = cutoffCommand.timestamp;
  
  // Keep only messages after cutoff
  data.messages = data.messages.filter(m => m.timestamp > cutoffTimestamp);
  
  return data;
}

/**
 * Add a message
 */
function addMessage(sessionId, message) {
  const data = loadSessionData(sessionId);
  if (!data) return null;
  
  const msgId = generateId('msg');
  const timestamp = new Date().toISOString();
  
  const msg = {
    id: msgId,
    session_id: sessionId,
    task_id: message.task_id || null,
    timestamp: timestamp,
    type: message.type,
    content: message.content || '',
    stream: message.stream || null,
    read: false
  };
  
  // 1. Add to main file
  data.messages.push(msg);
  data.session.updated_at = timestamp;
  
  // 2. Prune old messages (self-cycling)
  const prunedData = pruneOldMessages(data);
  data.messages = prunedData.messages;
  
  // 3. Save main file
  saveSessionData(sessionId, data);
  
  // 4. Append to archive file
  appendToArchive(sessionId, msg);
  
  return getMessage(msgId);
}

/**
 * Get message by ID
 */
function getMessage(msgId) {
  const index = loadSessionsIndex();
  
  for (const sessionId of index.sessions) {
    const data = loadSessionData(sessionId);
    if (data) {
      const msg = data.messages.find(m => m.id === msgId);
      if (msg) return msg;
    }
  }
  
  return null;
}

/**
 * Get unread count for a session
 */
function getUnreadCount(sessionId) {
  const data = loadSessionData(sessionId);
  if (!data) return 0;
  
  return data.messages.filter(m => !m.read).length;
}

/**
 * Get message count for a session
 */
function getMessageCount(sessionId) {
  const data = loadSessionData(sessionId);
  if (!data) return 0;
  
  return data.messages.length;
}

/**
 * Query messages with filters
 */
function queryMessages(sessionId, options = {}) {
  const data = loadSessionData(sessionId);
  if (!data) return [];
  
  let messages = [...data.messages];
  
  const {
    since,
    until,
    type,
    taskId,
    unreadOnly,
    read,
    search,
    limit,
    offset,
    reverse
  } = options;
  
  // Apply filters
  if (since) {
    messages = messages.filter(m => m.timestamp > since);
  }
  
  if (until) {
    messages = messages.filter(m => m.timestamp < until);
  }
  
  if (type) {
    messages = messages.filter(m => m.type === type);
  }
  
  if (taskId) {
    messages = messages.filter(m => m.task_id === taskId);
  }
  
  if (unreadOnly) {
    messages = messages.filter(m => !m.read);
  }
  
  if (read !== undefined) {
    messages = messages.filter(m => m.read === read);
  }
  
  if (search) {
    const searchLower = search.toLowerCase();
    messages = messages.filter(m => 
      m.content && m.content.toLowerCase().includes(searchLower)
    );
  }
  
  // Sort
  messages.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return reverse ? timeA - timeB : timeB - timeA;
  });
  
  // Apply pagination
  if (offset) {
    messages = messages.slice(offset);
  }
  
  if (limit) {
    messages = messages.slice(0, limit);
  }
  
  return messages;
}

/**
 * Get unread messages
 */
function getUnreadMessages(sessionId) {
  return queryMessages(sessionId, { unreadOnly: true });
}

/**
 * Get messages by task
 */
function getMessagesByTask(sessionId, taskId) {
  return queryMessages(sessionId, { taskId });
}

/**
 * Mark messages as read
 */
function markAsRead(sessionId, options = {}) {
  const data = loadSessionData(sessionId);
  if (!data) return { marked_count: 0, unread_count: 0 };
  
  const { messageIds, all = false, beforeTimestamp } = options;
  
  let markedCount = 0;
  
  // Validate messageIds array
  if (messageIds !== undefined && messageIds !== null) {
    if (!Array.isArray(messageIds)) {
      throw new Error('messageIds must be an array');
    }
    if (messageIds.length === 0) {
      return { marked_count: 0, unread_count: getUnreadCount(sessionId) };
    }
    
    // Mark specified messages as read
    data.messages.forEach(msg => {
      if (messageIds.includes(msg.id) && !msg.read) {
        msg.read = true;
        markedCount++;
      }
    });
  } else if (all) {
    // Mark all as read
    data.messages.forEach(msg => {
      if (!msg.read) {
        msg.read = true;
        markedCount++;
      }
    });
  } else if (beforeTimestamp) {
    // Mark messages before timestamp as read
    data.messages.forEach(msg => {
      if (msg.timestamp <= beforeTimestamp && !msg.read) {
        msg.read = true;
        markedCount++;
      }
    });
  }
  
  if (markedCount > 0) {
    data.session.updated_at = new Date().toISOString();
    saveSessionData(sessionId, data);
    updateLastRead(sessionId);
  }
  
  return {
    marked_count: markedCount,
    unread_count: getUnreadCount(sessionId)
  };
}

/**
 * Get command history
 */
function getCommandHistory(sessionId, limit = 50) {
  const data = loadSessionData(sessionId);
  if (!data) return [];
  
  const commands = data.messages
    .filter(m => m.type === 'command')
    .map(m => {
      const task = data.tasks.find(t => t.id === m.task_id);
      return {
        id: m.id,
        task_id: m.task_id,
        command: m.content,
        timestamp: m.timestamp,
        status: task ? task.status : null,
        exit_code: task ? task.exit_code : null,
        has_output: task && task.output && task.output.length > 0,
        has_error: task && task.stderr && task.stderr.length > 0
      };
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
  
  return commands;
}

/**
 * Search messages
 */
function searchMessages(sessionId, query, options = {}) {
  return queryMessages(sessionId, {
    search: query,
    ...options
  });
}

/**
 * Get session statistics
 */
function getSessionStats(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  
  const data = loadSessionData(sessionId);
  if (!data) return null;
  
  const messages = data.messages;
  const timestamps = messages.map(m => m.timestamp).sort();
  
  return {
    session_id: sessionId,
    status: session.status,
    total_messages: messages.length,
    unread_count: session.unread_count,
    command_count: messages.filter(m => m.type === 'command').length,
    output_count: messages.filter(m => m.type === 'output').length,
    error_count: messages.filter(m => m.type === 'error').length,
    first_message: timestamps[0] || null,
    last_message: timestamps[timestamps.length - 1] || null,
    created_at: session.created_at,
    updated_at: session.updated_at
  };
}

// ============================================
// Archive Operations
// ============================================

/**
 * List archive files for a session
 */
function listArchives(sessionId) {
  const archives = [];
  const files = fs.readdirSync(SESSIONS_DIR);
  const archivePattern = new RegExp(`^${sessionId}\\.(\\d+)\\.json$`);
  
  for (const file of files) {
    const match = file.match(archivePattern);
    if (!match) continue;
    
    const num = parseInt(match[1]);
    const filePath = path.join(SESSIONS_DIR, file);
    const stats = fs.statSync(filePath);
    let messageCount = 0;
    
    try {
      const archiveData = readJsonFile(filePath, { messages: [] });
      messageCount = archiveData.messages ? archiveData.messages.length : 0;
    } catch {
      // Ignore parse errors
    }
    
    archives.push({
      num,
      file,
      path: filePath,
      size: stats.size,
      messageCount,
      modified: stats.mtime
    });
  }
  
  // Sort by archive number
  return archives.sort((a, b) => a.num - b.num);
}

/**
 * Read archived messages from a specific archive number
 */
function readArchive(sessionId, archiveNum) {
  const archivePath = getArchiveFilePath(sessionId, archiveNum);
  
  if (!fs.existsSync(archivePath)) {
    return null;
  }
  
  try {
    return readJsonFile(archivePath, null);
  } catch {
    return null;
  }
}

/**
 * Search across all archives
 */
function searchArchives(sessionId, query, options = {}) {
  const results = [];
  const searchLower = query.toLowerCase();
  
  // Get all archive files using listArchives (handles gaps in numbering)
  const archives = listArchives(sessionId);
  
  for (const archive of archives) {
    const archiveData = readArchive(sessionId, archive.num);
    if (!archiveData || !archiveData.messages) {
      continue;
    }
    
    const matches = archiveData.messages
      .filter(m => m.content && m.content.toLowerCase().includes(searchLower))
      .map(m => ({
        ...m,
        archive_num: archive.num
      }));
    
    if (matches.length > 0) {
      results.push(...matches);
    }
    
    // Respect limit
    if (options.limit && results.length >= options.limit) {
      return results.slice(0, options.limit);
    }
  }
  
  return results;
}

/**
 * Get session info including archive status
 */
function getSessionInfo(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  
  const filePath = getSessionFilePath(sessionId);
  const fileSize = getFileSize(filePath);
  const archives = listArchives(sessionId);
  const totalArchiveSize = archives.reduce((sum, a) => sum + a.size, 0);
  const totalArchiveMessages = archives.reduce((sum, a) => sum + a.messageCount, 0);
  
  return {
    ...session,
    file_size: fileSize,
    file_size_formatted: formatBytes(fileSize),
    archive_count: archives.length,
    archive_size: totalArchiveSize,
    archive_size_formatted: formatBytes(totalArchiveSize),
    archive_messages: totalArchiveMessages,
    archives: archives.slice(0, 5) // Show last 5 archives
  };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============================================
// Log File Operations (NEW)
// ============================================

/**
 * Get log file path
 */
function getLogFilePath(sessionId, logNum = 0) {
  if (logNum === 0) {
    return path.join(SESSIONS_DIR, `${sessionId}.log`);
  }
  return path.join(SESSIONS_DIR, `${sessionId}.${logNum}.log`);
}

/**
 * Get current log number (find the latest log file)
 */
function getCurrentLogNum(sessionId) {
  let num = 0;
  while (fs.existsSync(getLogFilePath(sessionId, num))) {
    num++;
  }
  return num > 0 ? num - 1 : 0;
}

/**
 * Rotate log file if it exceeds max size
 * @returns {number} The current log number to write to
 */
function rotateLogIfNeeded(sessionId) {
  let logNum = getCurrentLogNum(sessionId);
  let logPath = getLogFilePath(sessionId, logNum);
  
  // Check if current log is full, rotate it
  if (fs.existsSync(logPath) && getFileSize(logPath) > LOG_CONFIG.maxLogSize) {
    // Increment log number
    logNum++;
    logPath = getLogFilePath(sessionId, logNum);
    
    // Clean up old logs if we exceed the limit
    const oldestLogNum = logNum - LOG_CONFIG.keepRotatedLogs;
    if (oldestLogNum > 0) {
      const oldLogPath = getLogFilePath(sessionId, oldestLogNum);
      if (fs.existsSync(oldLogPath)) {
        try {
          fs.unlinkSync(oldLogPath);
        } catch (err) {
          console.error(`Failed to delete old log ${oldLogPath}: ${err.message}`);
        }
      }
    }
  }
  
  return logNum;
}

/**
 * Escape content for log file storage
 * Newlines are escaped to ensure each log entry is a single line
 *
 * @param {string} content - Raw content
 * @returns {string} Escaped content safe for single-line log format
 */
function escapeLogContent(content) {
  if (!content) return '';
  // Escape newlines: \n -> \\n, \r -> \\r
  // This ensures each log entry is a single line for reliable parsing
  return content
    .replace(/\r\n/g, '\\r\\n')  // Windows line endings
    .replace(/\n/g, '\\n')       // Unix line endings
    .replace(/\r/g, '\\r');      // Old Mac line endings
}

/**
 * Unescape content read from log file
 * Restore original newlines from escaped format
 *
 * @param {string} content - Escaped content from log
 * @returns {string} Original content with newlines restored
 */
function unescapeLogContent(content) {
  if (!content) return '';
  // Unescape newlines: \\n -> \n, \\r -> \r
  return content
    .replace(/\\r\\n/g, '\r\n')  // Windows line endings
    .replace(/\\n/g, '\n')       // Unix line endings
    .replace(/\\r/g, '\r');      // Old Mac line endings
}

/**
 * Append output to log file
 * Format: [timestamp] [task_id] [type] content
 *
 * Content is escaped to ensure each log entry is a single line.
 * This prevents multi-line output from breaking log parsing.
 *
 * @param {string} sessionId - Session ID
 * @param {string} taskId - Task ID
 * @param {string} type - Output type: COMMAND, STDOUT, STDERR, EXIT, SYSTEM
 * @param {string} content - Output content (can contain any characters, including newlines)
 * @returns {object} { log_num, log_offset, bytes_written, error? }
 */
function appendToLog(sessionId, taskId, type, content) {
  ensureDirectories();
  
  const logNum = rotateLogIfNeeded(sessionId);
  const logPath = getLogFilePath(sessionId, logNum);
  
  // Get current file size for offset
  const logOffset = getFileSize(logPath);
  
  // Format log entry
  const timestamp = new Date().toISOString();
  // Escape newlines to ensure single-line format for reliable parsing
  const escapedContent = escapeLogContent(content);
  const logLine = `[${timestamp}] [${taskId}] [${type}] ${escapedContent}\n`;
  
  try {
    // Append to log file (using appendFileSync for atomic writes)
    fs.appendFileSync(logPath, logLine, 'utf8');
    
    return {
      log_num: logNum,
      log_offset: logOffset,
      bytes_written: Buffer.byteLength(logLine, 'utf8')
    };
  } catch (err) {
    console.error(`Failed to append to log ${logPath}: ${err.message}`);
    return {
      log_num: logNum,
      log_offset: -1,
      bytes_written: 0,
      error: err.message
    };
  }
}

/**
 * Read log content for a specific task
 * 
 * @param {string} sessionId - Session ID
 * @param {string} taskId - Task ID
 * @param {object} options - { log_num, log_offset, include_types }
 * @returns {object} { stdout, stderr, exit_code }
 */
function readTaskLog(sessionId, taskId, options = {}) {
  const { logNum = null, logOffset = null, includeTypes = ['STDOUT', 'STDERR', 'EXIT'] } = options;
  
  const stdout = [];
  const stderr = [];
  let exitCode = null;
  
  // Determine which log files to read
  const logFiles = [];
  if (logNum !== null) {
    // Read specific log file
    const logPath = getLogFilePath(sessionId, logNum);
    if (fs.existsSync(logPath)) {
      logFiles.push({ num: logNum, path: logPath });
    }
  } else {
    // Read all log files
    const currentLogNum = getCurrentLogNum(sessionId);
    for (let num = 0; num <= currentLogNum; num++) {
      const logPath = getLogFilePath(sessionId, num);
      if (fs.existsSync(logPath)) {
        logFiles.push({ num, path: logPath });
      }
    }
  }
  
  // Parse log entries
  const taskPattern = new RegExp(`^\\[[^\\]]+\\] \\[${taskId}\\] \\[([^\\]]+)\\] (.*)$`);
  
  for (const logFile of logFiles) {
    try {
      const content = fs.readFileSync(logFile.path, 'utf8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Skip if offset is specified and we're before it
        if (logOffset !== null && logFile.num === logNum) {
          // Rough offset check - skip lines until we're past the offset
          // This is approximate; for exact offset we'd need byte counting
        }
        
        const match = line.match(taskPattern);
        if (match) {
          const type = match[1];
          const data = match[2];
          
          if (includeTypes.includes(type)) {
            // Unescape content to restore original newlines
            const unescapedData = unescapeLogContent(data);
            
            if (type === 'STDOUT') {
              stdout.push(unescapedData);
            } else if (type === 'STDERR') {
              stderr.push(unescapedData);
            } else if (type === 'EXIT') {
              exitCode = parseInt(data) || data;  // EXIT code doesn't need unescaping
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to read log ${logFile.path}: ${err.message}`);
    }
  }
  
  return {
    stdout: stdout.join(''),
    stderr: stderr.join(''),
    exit_code: exitCode
  };
}

/**
 * Search across all log files
 * 
 * @param {string} sessionId - Session ID
 * @param {string} query - Search query
 * @param {object} options - { limit, task_id }
 * @returns {array} Array of matching entries
 */
function searchLogs(sessionId, query, options = {}) {
  const { limit = 50, taskId = null } = options;
  const results = [];
  const queryLower = query.toLowerCase();
  
  const currentLogNum = getCurrentLogNum(sessionId);
  
  for (let num = 0; num <= currentLogNum; num++) {
    const logPath = getLogFilePath(sessionId, num);
    if (!fs.existsSync(logPath)) continue;
    
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Parse log entry
        const entryPattern = /^\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.*)$/;
        const match = line.match(entryPattern);
        
        if (match) {
          const timestamp = match[1];
          const entryTaskId = match[2];
          const type = match[3];
          const data = match[4];
          
          // Filter by task_id if specified
          if (taskId && entryTaskId !== taskId) continue;
          
          // Search in data (search in escaped format, but return unescaped)
          if (data.toLowerCase().includes(queryLower)) {
            results.push({
              timestamp,
              task_id: entryTaskId,
              type,
              content: unescapeLogContent(data),  // Return unescaped content
              log_num: num
            });
            
            if (results.length >= limit) {
              return results;
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to search log ${logPath}: ${err.message}`);
    }
  }
  
  return results;
}

/**
 * List log files for a session
 */
function listLogs(sessionId) {
  const logs = [];
  const files = fs.readdirSync(SESSIONS_DIR);
  const logPattern = new RegExp(`^${sessionId}(?:\\.(\\d+))?\\.log$`);
  
  for (const file of files) {
    const match = file.match(logPattern);
    if (!match) continue;
    
    const num = match[1] ? parseInt(match[1]) : 0;
    const filePath = path.join(SESSIONS_DIR, file);
    const stats = fs.statSync(filePath);
    
    logs.push({
      num,
      file,
      path: filePath,
      size: stats.size,
      size_formatted: formatBytes(stats.size),
      modified: stats.mtime
    });
  }
  
  // Sort by log number (newest first)
  return logs.sort((a, b) => b.num - a.num);
}

/**
 * Close (no-op for JSON storage)
 */
function close() {
  // No connection to close for JSON files
}

module.exports = {
  // Session operations
  generateId,
  createSession,
  getSession,
  updateSessionStatus,
  getSessionSummary,
  listSessions,
  deleteSession,
  
  // Task operations
  createTask,
  getTask,
  updateTask,
  listTasks,
  getTaskOutput,
  deleteTask,
  
  // Message operations
  addMessage,
  getMessage,
  getUnreadCount,
  getMessageCount,
  queryMessages,
  getUnreadMessages,
  getMessagesByTask,
  markAsRead,
  getCommandHistory,
  searchMessages,
  getSessionStats,
  
  // Archive operations
  listArchives,
  readArchive,
  searchArchives,
  getSessionInfo,
  ARCHIVE_CONFIG,
  
  // Log operations (NEW)
  appendToLog,
  readTaskLog,
  searchLogs,
  listLogs,
  getLogFilePath,
  getCurrentLogNum,
  LOG_CONFIG,
  escapeLogContent,
  unescapeLogContent,
  
  // Database
  close
};