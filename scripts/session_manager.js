#!/usr/bin/env node
/**
 * Session Manager - Background process
 *
 * Manages SSH sessions and executes commands.
 * Uses JSON files for persistent storage (no native dependencies).
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./db-json');

// Data directory paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const PID_FILE = path.join(DATA_DIR, 'manager.pid');
const COMMANDS_DIR = path.join(DATA_DIR, 'commands');

// Active SSH connections
const connections = new Map();

// Active SFTP sessions (sessionId -> sftp)
const sftpSessions = new Map();

// Sudo password cache (sessionId -> password)
// Stored in memory only, not persisted to disk for security
const sudoPasswordCache = new Map();

// Full config cache (sessionId -> config with password)
// Stored in memory only for reconnection support
const configCache = new Map();

/**
 * Output JSON
 */
function output(result) {
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Check if manager is running
 */
function isRunning() {
  if (!fs.existsSync(PID_FILE)) {
    return false;
  }
  
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
  
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    fs.unlinkSync(PID_FILE);
    return false;
  }
}

/**
 * Write PID file
 */
function writePid() {
  const dir = path.dirname(PID_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(PID_FILE, process.pid.toString());
}

/**
 * Setup SSH connection
 */
async function setupConnection(sessionId, config) {
  const conn = new Client();
  
  // Cache full config (with password) in memory for reconnection
  configCache.set(sessionId, config);
  
  return new Promise((resolve, reject) => {
    conn.on('ready', () => {
      connections.set(sessionId, conn);
      // Cache password for sudo commands (in memory only)
      if (config.password) {
        sudoPasswordCache.set(sessionId, config.password);
      }
      
      // Initialize SFTP session
      conn.sftp((err, sftp) => {
        if (err) {
          console.error(`SFTP init failed for ${sessionId}: ${err.message}`);
        } else {
          sftpSessions.set(sessionId, sftp);
          console.log(`SFTP session initialized for ${sessionId}`);
        }
      });
      
      db.updateSessionStatus(sessionId, 'connected');
      db.addMessage(sessionId, {
        type: 'system',
        content: `Connected to ${config.host}:${config.port || 22}`
      });
      resolve(conn);
    });
    
    conn.on('error', (err) => {
      db.updateSessionStatus(sessionId, 'error');
      db.addMessage(sessionId, {
        type: 'error',
        content: err.message
      });
      reject(err);
    });
    
    conn.on('close', () => {
      connections.delete(sessionId);
      sftpSessions.delete(sessionId);
      db.updateSessionStatus(sessionId, 'disconnected');
      db.addMessage(sessionId, {
        type: 'system',
        content: 'Connection closed'
      });
    });
    
    // Prepare connection config
    const sshConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      readyTimeout: 30000,
      keepaliveInterval: 10000,
      // Add algorithms for compatibility with older SSH servers
      algorithms: {
        kex: [
          'diffie-hellman-group-exchange-sha1',
          'diffie-hellman-group14-sha1',
          'diffie-hellman-group1-sha1',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521'
        ],
        cipher: [
          'aes128-ctr',
          'aes192-ctr',
          'aes256-ctr',
          'aes128-cbc',
          'aes192-cbc',
          'aes256-cbc',
          '3des-cbc'
        ],
        serverHostKey: [
          'ssh-rsa',
          'ssh-dss',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521'
        ],
        hmac: [
          'hmac-sha1',
          'hmac-sha2-256',
          'hmac-sha2-512',
          'hmac-sha1-96'
        ]
      }
    };
    
    if (config.password) {
      sshConfig.password = config.password;
    } else if (config.private_key) {
      const keyPath = config.private_key.replace('~', os.homedir());
      try {
        sshConfig.privateKey = fs.readFileSync(keyPath, 'utf-8');
        if (config.passphrase) {
          sshConfig.passphrase = config.passphrase;
        }
      } catch (err) {
        reject(new Error(`Failed to read private key: ${err.message}`));
        return;
      }
    } else {
      const defaultKey = path.join(os.homedir(), '.ssh', 'id_rsa');
      if (fs.existsSync(defaultKey)) {
        try {
          sshConfig.privateKey = fs.readFileSync(defaultKey, 'utf-8');
        } catch (err) {
          reject(new Error(`Failed to read default key: ${err.message}`));
          return;
        }
      }
    }
    
    conn.connect(sshConfig);
  });
}

/**
 * Execute command on session
 */
async function executeCommand(sessionId, taskId, command, options = {}) {
  const conn = connections.get(sessionId);
  const task = db.getTask(taskId);
  
  if (!conn) {
    task.status = 'error';
    task.output = 'Not connected';
    db.updateTask(task);
    
    db.addMessage(sessionId, {
      type: 'error',
      task_id: taskId,
      content: 'Not connected'
    });
    return;
  }
  
  task.status = 'running';
  db.updateTask(task);
  
  db.addMessage(sessionId, {
    type: 'command',
    task_id: taskId,
    content: command
  });
  
  // Build exec options (PTY for interactive programs or sudo commands)
  const execOptions = {};
  if (options.pty || options.sudo) {
    execOptions.pty = {
      cols: options.cols || 120,
      rows: options.rows || 24,
      term: options.term || 'xterm-256color'
    };
  }
  
  conn.exec(command, execOptions, (err, stream) => {
    if (err) {
      task.status = 'error';
      task.output = err.message;
      db.updateTask(task);
      
      db.addMessage(sessionId, {
        type: 'error',
        task_id: taskId,
        content: err.message
      });
      return;
    }
    
    let stdout = '';
    let stderr = '';
    
    stream.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      
      // Update task with partial output
      task.output = stdout;
      db.updateTask(task);
      
      // Add output message
      db.addMessage(sessionId, {
        type: 'output',
        task_id: taskId,
        content: chunk,
        stream: 'stdout'
      });
    });
    
    stream.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      task.stderr = stderr;
      db.updateTask(task);
      
      db.addMessage(sessionId, {
        type: 'output',
        task_id: taskId,
        content: chunk,
        stream: 'stderr'
      });
    });
    
    stream.on('close', (code, signal) => {
      task.status = 'completed';
      task.output = stdout;
      task.stderr = stderr;
      task.exit_code = code;
      task.completed_at = new Date().toISOString();
      db.updateTask(task);
      
      db.addMessage(sessionId, {
        type: 'complete',
        task_id: taskId,
        content: signal || undefined
      });
    });
  });
}

/**
 * Execute sudo command with password
 */
async function executeSudoCommand(sessionId, taskId, command, password) {
  const conn = connections.get(sessionId);
  const task = db.getTask(taskId);
  
  if (!conn) {
    task.status = 'error';
    task.output = 'Not connected';
    db.updateTask(task);
    
    db.addMessage(sessionId, {
      type: 'error',
      task_id: taskId,
      content: 'Not connected'
    });
    return;
  }
  
  task.status = 'running';
  db.updateTask(task);
  
  db.addMessage(sessionId, {
    type: 'command',
    task_id: taskId,
    content: `sudo ${command}`
  });
  
  const ptyConfig = {
    cols: 120,
    rows: 24,
    term: 'xterm-256color'
  };
  
  const sudoCommand = `sudo -S ${command}`;
  
  conn.exec(sudoCommand, { pty: ptyConfig }, (err, stream) => {
    if (err) {
      task.status = 'error';
      task.output = err.message;
      db.updateTask(task);
      
      db.addMessage(sessionId, {
        type: 'error',
        task_id: taskId,
        content: err.message
      });
      return;
    }
    
    let stdout = '';
    let stderr = '';
    let passwordSent = false;
    let passwordAttempts = 0;
    const maxPasswordAttempts = 3;
    
    // Escape regex special characters for safe password matching
    const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Sudo password prompt patterns
    const passwordPromptPatterns = [
      /\[sudo\].*password/i,
      /password\s*(for|:)/i,
      /^Password:/im
    ];
    
    stream.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      
      // Check for password prompt (fixed: && instead of ||)
      if (!passwordSent && passwordAttempts < maxPasswordAttempts) {
        const isPasswordPrompt = passwordPromptPatterns.some(pattern => pattern.test(chunk));
        
        if (isPasswordPrompt) {
          stream.write(password + '\n');
          passwordSent = true;
          passwordAttempts++;
          
          // Add a message about password prompt detected
          db.addMessage(sessionId, {
            type: 'system',
            task_id: taskId,
            content: '[sudo] Password prompt detected, sending password...'
          });
          
          // Clear password from the output to avoid logging it (fixed: escape special chars)
          stdout = stdout.replace(new RegExp(`^${escapeRegExp(password)}$`, 'gm'), '********');
        }
      }
      
      // Update task with partial output
      task.output = stdout;
      db.updateTask(task);
      
      // Sanitize output before storing (mask password if present)
      const sanitizedChunk = chunk.replace(new RegExp(escapeRegExp(password), 'g'), '********');
      
      // Add output message
      db.addMessage(sessionId, {
        type: 'output',
        task_id: taskId,
        content: sanitizedChunk,
        stream: 'stdout'
      });
    });
    
    stream.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      task.stderr = stderr;
      db.updateTask(task);
      
      db.addMessage(sessionId, {
        type: 'output',
        task_id: taskId,
        content: chunk,
        stream: 'stderr'
      });
    });
    
    stream.on('close', (code, signal) => {
      task.status = 'completed';
      task.output = stdout;
      task.stderr = stderr;
      task.exit_code = code;
      task.completed_at = new Date().toISOString();
      db.updateTask(task);
      
      db.addMessage(sessionId, {
        type: 'complete',
        task_id: taskId,
        content: signal || undefined
      });
      
      // Clear password from memory for security
      password = null;
    });
  });
}

// ==================== SFTP Functions ====================

// POSIX file type constants for SFTP operations
const SFTP_FILE_TYPES = {
  S_IFMT: 0o170000,   // File type mask
  S_IFDIR: 0o040000,  // Directory
  S_IFREG: 0o100000,  // Regular file
  S_IFLNK: 0o120000   // Symlink
};

/**
 * Validate and sanitize SFTP path
 *
 * Security checks:
 * - Remove null bytes (prevent truncation attacks)
 * - Warn about path traversal patterns (but don't block - user may need them intentionally)
 * - Validate path is a string
 *
 * @param {string} inputPath - User-provided path
 * @param {string} sessionId - Session ID for logging
 * @returns {object} { path: string, warning: string|null }
 */
function validateSftpPath(inputPath, sessionId) {
  if (typeof inputPath !== 'string') {
    return { error: 'Path must be a string' };
  }
  
  let path = inputPath;
  let warning = null;
  
  // Remove null bytes (security critical)
  if (path.includes('\0')) {
    path = path.replace(/\0/g, '');
    warning = 'Path contained null bytes which were removed';
    console.warn(`[SFTP] Session ${sessionId}: Path contained null bytes`);
  }
  
  // Warn about path traversal (but don't block - user may intentionally need ..)
  if (path.includes('..')) {
    warning = 'Path contains ".." - ensure this is intentional';
    console.warn(`[SFTP] Session ${sessionId}: Path contains "..": ${path}`);
  }
  
  return { path, warning };
}

/**
 * Validate local file path for upload
 *
 * @param {string} localPath - Local file path
 * @returns {object} { path: string, error: string|null, warning: string|null }
 */
function validateLocalPath(localPath) {
  const expanded = localPath.replace('~', os.homedir());
  
  // Check for null bytes
  if (expanded.includes('\0')) {
    return { error: 'Path contains invalid null bytes', path: null };
  }
  
  return { path: expanded, error: null, warning: null };
}

/**
 * Generic SFTP operation wrapper
 *
 * Provides common error handling, task status management, and message logging
 * for all SFTP operations.
 *
 * @param {string} sessionId - Session ID
 * @param {string} taskId - Task ID
 * @param {string} operationType - Operation type (e.g., 'sftp_list', 'sftp_download')
 * @param {string} commandText - Human-readable command for logging
 * @param {object} options - Additional options
 * @param {function} options.preCheck - Pre-execution check function, return { error, message } if failed
 * @param {function} options.execute - Main execution function: (sftp, task) => Promise<void>
 * @param {object} options.taskFields - Additional fields to set on task (e.g., { source, destination })
 * @returns {Promise<void>}
 */
async function sftpOperation(sessionId, taskId, operationType, commandText, options = {}) {
  const sftp = sftpSessions.get(sessionId);
  const task = db.getTask(taskId);
  
  // Common error: SFTP session not available
  if (!sftp) {
    task.status = 'error';
    task.output = 'SFTP session not available';
    task.type = operationType;
    db.updateTask(task);
    
    db.addMessage(sessionId, {
      type: 'error',
      task_id: taskId,
      content: 'SFTP session not available. Please reconnect.'
    });
    return;
  }
  
  // Run pre-check if provided
  if (options.preCheck) {
    const checkResult = options.preCheck();
    if (checkResult && checkResult.error) {
      task.status = 'error';
      task.output = checkResult.message;
      task.type = operationType;
      db.updateTask(task);
      
      db.addMessage(sessionId, {
        type: 'error',
        task_id: taskId,
        content: checkResult.message
      });
      return;
    }
  }
  
  // Set task as running
  task.status = 'running';
  task.type = operationType;
  
  // Apply additional task fields
  if (options.taskFields) {
    Object.assign(task, options.taskFields);
  }
  
  db.updateTask(task);
  
  // Log command
  db.addMessage(sessionId, {
    type: 'command',
    task_id: taskId,
    content: commandText
  });
  
  // Execute the operation
  try {
    await options.execute(sftp, task);
  } catch (err) {
    // Handle synchronous errors
    task.status = 'error';
    task.output = err.message;
    db.updateTask(task);
    
    db.addMessage(sessionId, {
      type: 'error',
      task_id: taskId,
      content: `${operationType.replace('sftp_', 'SFTP ')} failed: ${err.message}`
    });
  }
}

/**
 * Helper: Complete task with success
 */
function completeTask(task, output, extraFields = {}) {
  task.status = 'completed';
  task.output = output;
  task.completed_at = new Date().toISOString();
  Object.assign(task, extraFields);
  db.updateTask(task);
}

/**
 * Helper: Fail task with error
 */
function failTask(task, error, sessionId, taskId, operationName) {
  task.status = 'error';
  task.output = error;
  db.updateTask(task);
  
  db.addMessage(sessionId, {
    type: 'error',
    task_id: taskId,
    content: `SFTP ${operationName} failed: ${error}`
  });
}

/**
 * Helper: Log completion message
 */
function logComplete(sessionId, taskId, message) {
  db.addMessage(sessionId, {
    type: 'complete',
    task_id: taskId,
    content: message
  });
}

/**
 * Helper: Format file stats from SFTP
 */
function formatFileStats(attrs, name = null) {
  const { S_IFMT, S_IFDIR, S_IFREG, S_IFLNK } = SFTP_FILE_TYPES;
  
  const result = {
    size: attrs.size,
    mode: attrs.mode,
    mtime: new Date(attrs.mtime * 1000).toISOString(),
    atime: new Date(attrs.atime * 1000).toISOString(),
    is_file: (attrs.mode & S_IFMT) === S_IFREG,
    is_dir: (attrs.mode & S_IFMT) === S_IFDIR,
    is_symlink: (attrs.mode & S_IFMT) === S_IFLNK,
    permissions: (attrs.mode & 0o777).toString(8)
  };
  
  if (name !== null) {
    result.name = name;
  }
  
  return result;
}

/**
 * SFTP List directory
 */
async function sftpList(sessionId, taskId, remotePath) {
  // Validate path
  const validation = validateSftpPath(remotePath, sessionId);
  if (validation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = validation.error;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: validation.error });
    return;
  }
  const safePath = validation.path;
  
  await sftpOperation(sessionId, taskId, 'sftp_list', `sftp-list ${safePath}`, {
    execute: (sftp, task) => {
      return new Promise((resolve, reject) => {
        sftp.readdir(safePath, (err, list) => {
          if (err) {
            failTask(task, err.message, sessionId, taskId, 'list');
            reject(err);
            return;
          }
          
          const files = list.map(item => ({
            name: item.filename,
            longname: item.longname,
            ...formatFileStats(item.attrs)
          }));
          
          completeTask(task, JSON.stringify(files, null, 2), { files });
          logComplete(sessionId, taskId, `Listed ${files.length} items`);
          resolve();
        });
      });
    }
  });
}

/**
 * SFTP Download file
 */
async function sftpDownload(sessionId, taskId, remotePath, localPath) {
  // Validate paths
  const remoteValidation = validateSftpPath(remotePath, sessionId);
  if (remoteValidation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = remoteValidation.error;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: remoteValidation.error });
    return;
  }
  
  const localValidation = validateLocalPath(localPath);
  if (localValidation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = localValidation.error;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: localValidation.error });
    return;
  }
  
  const safeRemotePath = remoteValidation.path;
  const safeLocalPath = localValidation.path;
  
  await sftpOperation(sessionId, taskId, 'sftp_download', `sftp-download ${safeRemotePath} -> ${localPath}`, {
    taskFields: { source: safeRemotePath, destination: localPath },
    execute: (sftp, task) => {
      return new Promise((resolve, reject) => {
        sftp.fastGet(safeRemotePath, safeLocalPath, (err) => {
          if (err) {
            failTask(task, err.message, sessionId, taskId, 'download');
            reject(err);
            return;
          }
          
          // Get file size
          let bytesTransferred = 0;
          try {
            bytesTransferred = fs.statSync(safeLocalPath).size;
          } catch (e) {}
          
          completeTask(task, `Downloaded ${safeRemotePath} to ${localPath}`, { bytes_transferred: bytesTransferred });
          logComplete(sessionId, taskId, `Downloaded ${safeRemotePath} to ${localPath} (${bytesTransferred} bytes)`);
          resolve();
        });
      });
    }
  });
}

/**
 * SFTP Upload file
 */
async function sftpUpload(sessionId, taskId, localPath, remotePath) {
  // Validate paths
  const localValidation = validateLocalPath(localPath);
  if (localValidation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = localValidation.error;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: localValidation.error });
    return;
  }
  
  const remoteValidation = validateSftpPath(remotePath, sessionId);
  if (remoteValidation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = remoteValidation.error;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: remoteValidation.error });
    return;
  }
  
  const safeLocalPath = localValidation.path;
  const safeRemotePath = remoteValidation.path;
  
  await sftpOperation(sessionId, taskId, 'sftp_upload', `sftp-upload ${localPath} -> ${safeRemotePath}`, {
    preCheck: () => {
      if (!fs.existsSync(safeLocalPath)) {
        return { error: true, message: `Local file not found: ${safeLocalPath}` };
      }
      return null;
    },
    taskFields: { source: localPath, destination: safeRemotePath },
    execute: (sftp, task) => {
      return new Promise((resolve, reject) => {
        sftp.fastPut(safeLocalPath, safeRemotePath, (err) => {
          if (err) {
            failTask(task, err.message, sessionId, taskId, 'upload');
            reject(err);
            return;
          }
          
          // Get file size AFTER successful upload
          let bytesTransferred = 0;
          try {
            bytesTransferred = fs.statSync(safeLocalPath).size;
          } catch (e) {}
          
          completeTask(task, `Uploaded ${localPath} to ${safeRemotePath}`, { bytes_transferred: bytesTransferred });
          logComplete(sessionId, taskId, `Uploaded ${localPath} to ${safeRemotePath} (${bytesTransferred} bytes)`);
          resolve();
        });
      });
    }
  });
}

/**
 * SFTP Stat (get file info)
 */
async function sftpStat(sessionId, taskId, remotePath) {
  // Validate path
  const validation = validateSftpPath(remotePath, sessionId);
  if (validation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = validation.error;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: validation.error });
    return;
  }
  const safePath = validation.path;
  
  await sftpOperation(sessionId, taskId, 'sftp_stat', `sftp-stat ${safePath}`, {
    execute: (sftp, task) => {
      return new Promise((resolve, reject) => {
        sftp.stat(safePath, (err, stats) => {
          if (err) {
            failTask(task, err.message, sessionId, taskId, 'stat');
            reject(err);
            return;
          }
          
          const fileInfo = {
            path: safePath,
            ...formatFileStats(stats)
          };
          
          completeTask(task, JSON.stringify(fileInfo, null, 2), { file_info: fileInfo });
          logComplete(sessionId, taskId, `Stat completed for ${safePath}`);
          resolve();
        });
      });
    }
  });
}

/**
 * SFTP Mkdir (create directory)
 */
async function sftpMkdir(sessionId, taskId, remotePath) {
  // Validate path
  const validation = validateSftpPath(remotePath, sessionId);
  if (validation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = validation.error;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: validation.error });
    return;
  }
  const safePath = validation.path;
  
  await sftpOperation(sessionId, taskId, 'sftp_mkdir', `sftp-mkdir ${safePath}`, {
    execute: (sftp, task) => {
      return new Promise((resolve, reject) => {
        sftp.mkdir(safePath, (err) => {
          if (err) {
            failTask(task, err.message, sessionId, taskId, 'mkdir');
            reject(err);
            return;
          }
          
          completeTask(task, `Directory created: ${safePath}`);
          logComplete(sessionId, taskId, `Directory created: ${safePath}`);
          resolve();
        });
      });
    }
  });
}

/**
 * SFTP Rmdir (remove directory)
 */
async function sftpRmdir(sessionId, taskId, remotePath) {
  // Validate path
  const validation = validateSftpPath(remotePath, sessionId);
  if (validation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = validation.error;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: validation.error });
    return;
  }
  const safePath = validation.path;
  
  await sftpOperation(sessionId, taskId, 'sftp_rmdir', `sftp-rmdir ${safePath}`, {
    execute: (sftp, task) => {
      return new Promise((resolve, reject) => {
        sftp.rmdir(safePath, (err) => {
          if (err) {
            failTask(task, err.message, sessionId, taskId, 'rmdir');
            reject(err);
            return;
          }
          
          completeTask(task, `Directory removed: ${safePath}`);
          logComplete(sessionId, taskId, `Directory removed: ${safePath}`);
          resolve();
        });
      });
    }
  });
}

/**
 * SFTP Delete (remove file)
 */
async function sftpDelete(sessionId, taskId, remotePath) {
  // Validate path
  const validation = validateSftpPath(remotePath, sessionId);
  if (validation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = validation.error;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: validation.error });
    return;
  }
  const safePath = validation.path;
  
  await sftpOperation(sessionId, taskId, 'sftp_delete', `sftp-delete ${safePath}`, {
    execute: (sftp, task) => {
      return new Promise((resolve, reject) => {
        sftp.unlink(safePath, (err) => {
          if (err) {
            failTask(task, err.message, sessionId, taskId, 'delete');
            reject(err);
            return;
          }
          
          completeTask(task, `File deleted: ${safePath}`);
          logComplete(sessionId, taskId, `File deleted: ${safePath}`);
          resolve();
        });
      });
    }
  });
}

/**
 * SFTP Rename (rename/move file)
 */
async function sftpRename(sessionId, taskId, oldPath, newPath) {
  // Validate both paths
  const oldValidation = validateSftpPath(oldPath, sessionId);
  if (oldValidation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = `Invalid old path: ${oldValidation.error}`;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: `Invalid old path: ${oldValidation.error}` });
    return;
  }
  
  const newValidation = validateSftpPath(newPath, sessionId);
  if (newValidation.error) {
    const task = db.getTask(taskId);
    task.status = 'error';
    task.output = `Invalid new path: ${newValidation.error}`;
    db.updateTask(task);
    db.addMessage(sessionId, { type: 'error', task_id: taskId, content: `Invalid new path: ${newValidation.error}` });
    return;
  }
  
  const safeOldPath = oldValidation.path;
  const safeNewPath = newValidation.path;
  
  await sftpOperation(sessionId, taskId, 'sftp_rename', `sftp-rename ${safeOldPath} -> ${safeNewPath}`, {
    taskFields: { source: safeOldPath, destination: safeNewPath },
    execute: (sftp, task) => {
      return new Promise((resolve, reject) => {
        sftp.rename(safeOldPath, safeNewPath, (err) => {
          if (err) {
            failTask(task, err.message, sessionId, taskId, 'rename');
            reject(err);
            return;
          }
          
          completeTask(task, `Renamed ${safeOldPath} to ${safeNewPath}`);
          logComplete(sessionId, taskId, `Renamed ${safeOldPath} to ${safeNewPath}`);
          resolve();
        });
      });
    }
  });
}

/**
 * Read file with retry (handles Windows fs.watch race condition)
 */
function readFileWithRetry(filePath, maxRetries = 5, delay = 50) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    
    function tryRead() {
      attempts++;
      try {
        if (!fs.existsSync(filePath)) {
          if (attempts < maxRetries) {
            setTimeout(tryRead, delay);
            return;
          }
          reject(new Error(`ENOENT: no such file or directory, open '${filePath}'`));
          return;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        resolve(JSON.parse(content));
      } catch (err) {
        if (attempts < maxRetries && (err.code === 'ENOENT' || err.message.includes('ENOENT'))) {
          setTimeout(tryRead, delay);
        } else {
          reject(err);
        }
      }
    }
    
    tryRead();
  });
}

/**
 * Watch for new commands
 */
function watchCommands() {
  const dir = path.dirname(COMMANDS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(COMMANDS_DIR)) {
    fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  }
  
  fs.watch(COMMANDS_DIR, (eventType, filename) => {
    if (eventType === 'rename' && filename && filename.endsWith('.json') && !filename.endsWith('.error')) {
      const filePath = path.join(COMMANDS_DIR, filename);
      
      setTimeout(async () => {
        try {
          const cmd = await readFileWithRetry(filePath);
          await processCommand(cmd);
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Failed to process command: ${err.message}`);
          
          // Try to report error back to caller
          try {
            const errorResponse = {
              success: false,
              error: err.message,
              command_id: filename.replace('.json', '')
            };
            // Write error to a response file
            const responseFile = path.join(COMMANDS_DIR, `${filename}.error`);
            fs.writeFileSync(responseFile, JSON.stringify(errorResponse));
          } catch (writeErr) {
            console.error(`Failed to write error response: ${writeErr.message}`);
          }
          
          // Clean up command file
          try {
            fs.unlinkSync(filePath);
          } catch {}
        }
      }, 100);
    }
  });
}

/**
 * Process incoming command
 */
async function processCommand(cmd) {
  switch (cmd.action) {
    case 'connect': {
      try {
        await setupConnection(cmd.session_id, cmd.config);
      } catch (err) {
        console.error(`Connect failed: ${err.message}`);
      }
      break;
    }
    
    case 'exec': {
      await executeCommand(cmd.session_id, cmd.task_id, cmd.command, {
        pty: cmd.pty || false,
        cols: cmd.cols || 120,
        rows: cmd.rows || 24,
        term: cmd.term || 'xterm-256color'
      });
      break;
    }
    
    case 'sudo': {
      // Use provided password or fall back to cached password from session
      let password = cmd.password;
      if (!password) {
        password = sudoPasswordCache.get(cmd.session_id);
      }
      if (!password) {
        const task = db.getTask(cmd.task_id);
        if (task) {
          task.status = 'error';
          task.output = 'No password available for sudo. Either provide --password or connect with password.';
          db.updateTask(task);
        }
        db.addMessage(cmd.session_id, {
          type: 'error',
          task_id: cmd.task_id,
          content: 'No password available for sudo'
        });
        break;
      }
      await executeSudoCommand(cmd.session_id, cmd.task_id, cmd.command, password);
      break;
    }
    
    case 'disconnect': {
      const conn = connections.get(cmd.session_id);
      if (conn) {
        conn.end();
      }
      break;
    }
    
    case 'shutdown': {
      for (const [sessionId, conn] of connections) {
        try {
          conn.end();
        } catch (err) {}
      }
      
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
      
      db.close();
      process.exit(0);
    }
    
    // SFTP commands
    case 'sftp_list': {
      await sftpList(cmd.session_id, cmd.task_id, cmd.path);
      break;
    }
    
    case 'sftp_download': {
      await sftpDownload(cmd.session_id, cmd.task_id, cmd.remote, cmd.local);
      break;
    }
    
    case 'sftp_upload': {
      await sftpUpload(cmd.session_id, cmd.task_id, cmd.local, cmd.remote);
      break;
    }
    
    case 'sftp_stat': {
      await sftpStat(cmd.session_id, cmd.task_id, cmd.path);
      break;
    }
    
    case 'sftp_mkdir': {
      await sftpMkdir(cmd.session_id, cmd.task_id, cmd.path);
      break;
    }
    
    case 'sftp_rmdir': {
      await sftpRmdir(cmd.session_id, cmd.task_id, cmd.path);
      break;
    }
    
    case 'sftp_delete': {
      await sftpDelete(cmd.session_id, cmd.task_id, cmd.path);
      break;
    }
    
    case 'sftp_rename': {
      await sftpRename(cmd.session_id, cmd.task_id, cmd.old_path, cmd.new_path);
      break;
    }
  }
}

/**
 * Restore sessions on startup
 */
async function restoreSessions() {
  const sessions = db.listSessions();
  
  for (const sessionInfo of sessions) {
    if (sessionInfo.status === 'connected') {
      // Use cached config (with password) if available, otherwise use disk config
      const config = configCache.get(sessionInfo.id);
      if (config) {
        try {
          console.log(`Restoring session ${sessionInfo.id}...`);
          await setupConnection(sessionInfo.id, config);
        } catch (err) {
          console.error(`Failed to restore session ${sessionInfo.id}: ${err.message}`);
        }
      } else {
        // No cached config - password not available, cannot reconnect
        console.log(`Session ${sessionInfo.id} cannot be restored (no cached credentials)`);
        db.updateSessionStatus(sessionInfo.id, 'disconnected');
      }
    }
  }
}

/**
 * Start the manager
 */
async function start() {
  if (isRunning()) {
    output({ success: false, error: 'Manager is already running' });
    return;
  }
  
  console.log('Starting Session Manager...');
  
  writePid();
  
  await restoreSessions();
  
  watchCommands();
  
  console.log(`Session Manager started (PID: ${process.pid})`);
  console.log('Watching for commands...');
  
  process.stdin.resume();
}

/**
 * Get manager status
 */
function status() {
  output({
    running: isRunning(),
    pid: isRunning() ? parseInt(fs.readFileSync(PID_FILE, 'utf-8')) : null,
    sessions: db.listSessions()
  });
}

/**
 * Stop the manager
 */
function stop() {
  if (!isRunning()) {
    output({ success: false, error: 'Manager is not running' });
    return;
  }
  
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'));
  
  try {
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(PID_FILE);
    output({ success: true, message: 'Manager stopped' });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  
  switch (command) {
    case 'start':
      await start();
      break;
    case 'status':
      status();
      break;
    case 'stop':
      stop();
      break;
    default:
      console.log('Usage: node session_manager.js [start|status|stop]');
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});