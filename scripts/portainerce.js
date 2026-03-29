#!/usr/bin/env node
/**
 * Portainer CE Management Client
 *
 * Manages Portainer stacks, containers, and endpoints via HTTP API.
 * Config: ../data/hosts/<host>.portainer.json
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

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
 * Read Portainer config from JSON file
 */
function readPortainerConfig(configPath) {
  try {
    const absolutePath = configPath.replace('~', require('os').homedir());
    
    if (!fs.existsSync(absolutePath)) {
      return { error: `Config file not found: ${absolutePath}` };
    }
    
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const config = JSON.parse(content);
    
    // Validate required fields
    if (!config.url) return { error: 'url is required in config' };
    if (!config.api_key) return { error: 'api_key is required in config' };
    
    // Default endpoint_id
    if (!config.endpoint_id) {
      config.endpoint_id = 2;
    }
    
    return { config };
  } catch (err) {
    return { error: `Failed to read config: ${err.message}` };
  }
}

/**
 * Make HTTP request to Portainer API
 */
function apiRequest(portainerConfig, endpoint, method, queryParams = {}, data = null) {
  return new Promise((resolve, reject) => {
    // Build URL
    const baseUrl = portainerConfig.url.replace(/\/+$/, '');
    let urlPath = `/api/${endpoint}`;
    
    // Add query parameters
    const qp = new URLSearchParams(queryParams);
    if (qp.toString()) {
      urlPath += `?${qp.toString()}`;
    }
    
    // Parse URL
    const parsedUrl = new URL(baseUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: urlPath,
      method: method,
      headers: {
        'X-API-Key': portainerConfig.api_key,
        'Content-Type': 'application/json'
      }
    };
    
    const req = httpModule.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        // Try to parse JSON
        try {
          const json = JSON.parse(body);
          resolve({
            status: res.statusCode,
            data: json
          });
        } catch (err) {
          resolve({
            status: res.statusCode,
            data: body,
            raw: true
          });
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// ============================================
// API Functions
// ============================================

/**
 * List stacks
 */
async function listStacks(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  try {
    const queryParams = { endpointId: portainer.endpoint_id };
    const result = await apiRequest(portainer, 'stacks', 'GET', queryParams);
    
    if (result.status !== 200) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, stacks: result.data });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Get stack by name or ID
 */
async function getStack(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name && !params.id) {
    return output({ success: false, error: '--name or --id is required' });
  }
  
  try {
    // First list stacks to find by name
    const queryParams = { endpointId: portainer.endpoint_id };
    const listResult = await apiRequest(portainer, 'stacks', 'GET', queryParams);
    
    if (listResult.status !== 200) {
      return output({ success: false, error: `API error: ${listResult.status}` });
    }
    
    // Find stack by name or ID
    const stack = listResult.data.find(s => 
      s.Name === params.name || s.Id === parseInt(params.id) || s.Id === params.id
    );
    
    if (!stack) {
      return output({ success: false, error: `Stack not found: ${params.name || params.id}` });
    }
    
    // Get full stack details
    const detailResult = await apiRequest(portainer, `stacks/${stack.Id}`, 'GET');
    
    output({ success: true, stack: detailResult.data });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Get stack file content
 */
async function getStackFile(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name && !params.id) {
    return output({ success: false, error: '--name or --id is required' });
  }
  
  try {
    // First list stacks to find by name
    const queryParams = { endpointId: portainer.endpoint_id };
    const listResult = await apiRequest(portainer, 'stacks', 'GET', queryParams);
    
    if (listResult.status !== 200) {
      return output({ success: false, error: `API error: ${listResult.status}` });
    }
    
    // Find stack by name or ID
    const stack = listResult.data.find(s => 
      s.Name === params.name || s.Id === parseInt(params.id) || s.Id === params.id
    );
    
    if (!stack) {
      return output({ success: false, error: `Stack not found: ${params.name || params.id}` });
    }
    
    // Get stack file content
    const fileResult = await apiRequest(portainer, `stacks/${stack.Id}/file`, 'GET');
    
    output({ success: true, stack: stack.Name, file: fileResult.data });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Create stack
 */
async function createStack(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name) return output({ success: false, error: '--name is required' });
  if (!params.file) return output({ success: false, error: '--file is required' });
  
  // Read compose file
  let composeContent;
  try {
    composeContent = fs.readFileSync(params.file, 'utf-8');
  } catch (err) {
    return output({ success: false, error: `Failed to read compose file: ${err.message}` });
  }
  
  try {
    const queryParams = {
      type: 2,  // Compose stack
      method: 'string',
      endpointId: portainer.endpoint_id
    };
    
    const payload = {
      Name: params.name,
      StackFileContent: composeContent
    };
    
    const result = await apiRequest(portainer, 'stacks', 'POST', queryParams, payload);
    
    if (result.status !== 200 && result.status !== 201) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, stack: result.data, message: `Stack '${params.name}' created` });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Update stack
 */
async function updateStack(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name && !params.id) {
    return output({ success: false, error: '--name or --id is required' });
  }
  if (!params.file) return output({ success: false, error: '--file is required' });
  
  // Read compose file
  let composeContent;
  try {
    composeContent = fs.readFileSync(params.file, 'utf-8');
  } catch (err) {
    return output({ success: false, error: `Failed to read compose file: ${err.message}` });
  }
  
  try {
    // First list stacks to find by name
    const queryParams = { endpointId: portainer.endpoint_id };
    const listResult = await apiRequest(portainer, 'stacks', 'GET', queryParams);
    
    if (listResult.status !== 200) {
      return output({ success: false, error: `API error: ${listResult.status}` });
    }
    
    // Find stack by name or ID
    const stack = listResult.data.find(s => 
      s.Name === params.name || s.Id === parseInt(params.id) || s.Id === params.id
    );
    
    if (!stack) {
      return output({ success: false, error: `Stack not found: ${params.name || params.id}` });
    }
    
    const payload = {
      StackFileContent: composeContent
    };
    
    const result = await apiRequest(portainer, `stacks/${stack.Id}`, 'PUT', {}, payload);
    
    if (result.status !== 200) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, stack: result.data, message: `Stack '${params.name || stack.Name}' updated` });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Delete stack
 */
async function deleteStack(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name && !params.id) {
    return output({ success: false, error: '--name or --id is required' });
  }
  
  try {
    // First list stacks to find by name
    const queryParams = { endpointId: portainer.endpoint_id };
    const listResult = await apiRequest(portainer, 'stacks', 'GET', queryParams);
    
    if (listResult.status !== 200) {
      return output({ success: false, error: `API error: ${listResult.status}` });
    }
    
    // Find stack by name or ID
    const stack = listResult.data.find(s => 
      s.Name === params.name || s.Id === parseInt(params.id) || s.Id === params.id
    );
    
    if (!stack) {
      return output({ success: false, error: `Stack not found: ${params.name || params.id}` });
    }
    
    const result = await apiRequest(portainer, `stacks/${stack.Id}`, 'DELETE');
    
    if (result.status !== 200 && result.status !== 204) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, message: `Stack '${params.name || stack.Name}' deleted` });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Start stack
 */
async function startStack(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name && !params.id) {
    return output({ success: false, error: '--name or --id is required' });
  }
  
  try {
    // First list stacks to find by name
    const queryParams = { endpointId: portainer.endpoint_id };
    const listResult = await apiRequest(portainer, 'stacks', 'GET', queryParams);
    
    if (listResult.status !== 200) {
      return output({ success: false, error: `API error: ${listResult.status}` });
    }
    
    // Find stack by name or ID
    const stack = listResult.data.find(s => 
      s.Name === params.name || s.Id === parseInt(params.id) || s.Id === params.id
    );
    
    if (!stack) {
      return output({ success: false, error: `Stack not found: ${params.name || params.id}` });
    }
    
    const result = await apiRequest(portainer, `stacks/${stack.Id}/start`, 'PUT');
    
    if (result.status !== 200) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, message: `Stack '${params.name || stack.Name}' started` });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Stop stack
 */
async function stopStack(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name && !params.id) {
    return output({ success: false, error: '--name or --id is required' });
  }
  
  try {
    // First list stacks to find by name
    const queryParams = { endpointId: portainer.endpoint_id };
    const listResult = await apiRequest(portainer, 'stacks', 'GET', queryParams);
    
    if (listResult.status !== 200) {
      return output({ success: false, error: `API error: ${listResult.status}` });
    }
    
    // Find stack by name or ID
    const stack = listResult.data.find(s => 
      s.Name === params.name || s.Id === parseInt(params.id) || s.Id === params.id
    );
    
    if (!stack) {
      return output({ success: false, error: `Stack not found: ${params.name || params.id}` });
    }
    
    const result = await apiRequest(portainer, `stacks/${stack.Id}/stop`, 'PUT');
    
    if (result.status !== 200) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, message: `Stack '${params.name || stack.Name}' stopped` });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * List containers
 */
async function listContainers(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  try {
    const endpoint = `endpoints/${portainer.endpoint_id}/docker/containers/json`;
    const queryParams = { all: params.all ? 'true' : 'false' };
    const result = await apiRequest(portainer, endpoint, 'GET', queryParams);
    
    if (result.status !== 200) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, containers: result.data });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Get container details
 */
async function getContainer(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name && !params.id) {
    return output({ success: false, error: '--name or --id is required' });
  }
  
  try {
    // First list containers to find by name
    const listEndpoint = `endpoints/${portainer.endpoint_id}/docker/containers/json`;
    const listResult = await apiRequest(portainer, listEndpoint, 'GET', { all: 'true' });
    
    if (listResult.status !== 200) {
      return output({ success: false, error: `API error: ${listResult.status}` });
    }
    
    // Find container by name or ID
    const container = listResult.data.find(c => 
      c.Names.some(n => n === `/${params.name}` || n === params.name) ||
      c.Id === params.id ||
      c.Id.startsWith(params.id)
    );
    
    if (!container) {
      return output({ success: false, error: `Container not found: ${params.name || params.id}` });
    }
    
    // Get full container details
    const detailEndpoint = `endpoints/${portainer.endpoint_id}/docker/containers/${container.Id}/json`;
    const detailResult = await apiRequest(portainer, detailEndpoint, 'GET');
    
    output({ success: true, container: detailResult.data });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Container action (start/stop/restart)
 */
async function containerAction(params, action) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name && !params.id) {
    return output({ success: false, error: '--name or --id is required' });
  }
  
  try {
    // First list containers to find by name
    const listEndpoint = `endpoints/${portainer.endpoint_id}/docker/containers/json`;
    const listResult = await apiRequest(portainer, listEndpoint, 'GET', { all: 'true' });
    
    if (listResult.status !== 200) {
      return output({ success: false, error: `API error: ${listResult.status}` });
    }
    
    // Find container by name or ID
    const container = listResult.data.find(c => 
      c.Names.some(n => n === `/${params.name}` || n === params.name) ||
      c.Id === params.id ||
      c.Id.startsWith(params.id)
    );
    
    if (!container) {
      return output({ success: false, error: `Container not found: ${params.name || params.id}` });
    }
    
    const actionEndpoint = `endpoints/${portainer.endpoint_id}/docker/containers/${container.Id}/${action}`;
    const result = await apiRequest(portainer, actionEndpoint, 'POST');
    
    if (result.status !== 200 && result.status !== 204) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, message: `Container '${params.name || container.Id.substring(0, 12)}' ${action}ed` });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Get container logs
 */
async function containerLogs(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  if (!params.name && !params.id) {
    return output({ success: false, error: '--name or --id is required' });
  }
  
  try {
    // First list containers to find by name
    const listEndpoint = `endpoints/${portainer.endpoint_id}/docker/containers/json`;
    const listResult = await apiRequest(portainer, listEndpoint, 'GET', { all: 'true' });
    
    if (listResult.status !== 200) {
      return output({ success: false, error: `API error: ${listResult.status}` });
    }
    
    // Find container by name or ID
    const container = listResult.data.find(c => 
      c.Names.some(n => n === `/${params.name}` || n === params.name) ||
      c.Id === params.id ||
      c.Id.startsWith(params.id)
    );
    
    if (!container) {
      return output({ success: false, error: `Container not found: ${params.name || params.id}` });
    }
    
    const logsEndpoint = `endpoints/${portainer.endpoint_id}/docker/containers/${container.Id}/logs`;
    const queryParams = {
      stdout: 'true',
      stderr: 'true',
      tail: params.tail || '100'
    };
    const result = await apiRequest(portainer, logsEndpoint, 'GET', queryParams);
    
    output({ 
      success: true, 
      container: params.name || container.Id.substring(0, 12),
      logs: result.data
    });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * List endpoints
 */
async function listEndpoints(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  try {
    const result = await apiRequest(portainer, 'endpoints', 'GET');
    
    if (result.status !== 200) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, endpoints: result.data });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Get Portainer status
 */
async function getStatus(params) {
  const configResult = readPortainerConfig(params.config);
  if (configResult.error) return output({ success: false, error: configResult.error });
  
  const { portainer } = { portainer: configResult.config };
  
  try {
    const result = await apiRequest(portainer, 'status', 'GET');
    
    if (result.status !== 200) {
      return output({ success: false, error: `API error: ${result.status}`, data: result.data });
    }
    
    output({ success: true, status: result.data });
  } catch (err) {
    output({ success: false, error: err.message });
  }
}

/**
 * Show help
 */
function help() {
  console.log('Portainer CE Management Client');
  console.log('');
  console.log('Usage: node portainerce.js <command> --config ../data/hosts/<host>.portainer.json');
  console.log('');
  console.log('Commands:');
  console.log('');
  console.log('  Stack Management:');
  console.log('    stacks list              List all stacks');
  console.log('    stacks get <name>        Get stack details (--name or --id)');
  console.log('    stacks file <name>       Get stack compose file content');
  console.log('    stacks create            Create stack (--name, --file required)');
  console.log('    stacks update <name>     Update stack (--name or --id, --file required)');
  console.log('    stacks delete <name>     Delete stack (--name or --id)');
  console.log('    stacks start <name>      Start stack');
  console.log('    stacks stop <name>       Stop stack');
  console.log('');
  console.log('  Container Management:');
  console.log('    containers list          List containers (--all for all states)');
  console.log('    containers get <name>    Get container details');
  console.log('    containers start <name>  Start container');
  console.log('    containers stop <name>   Stop container');
  console.log('    containers restart <name> Restart container');
  console.log('    containers logs <name>   Get container logs (--tail N)');
  console.log('');
  console.log('  Endpoint Management:');
  console.log('    endpoints list           List all endpoints');
  console.log('');
  console.log('  Status:');
  console.log('    status                   Get Portainer status');
  console.log('');
  console.log('Options:');
  console.log('  --config FILE     Portainer config file (JSON)');
  console.log('  --name NAME       Stack/container name');
  console.log('  --id ID           Stack/container ID (alternative to name)');
  console.log('  --file FILE       Docker compose file for create/update');
  console.log('  --all             List all containers (including stopped)');
  console.log('  --tail N          Number of log lines (default: 100)');
  console.log('');
  console.log('Config File Format:');
  console.log('  {');
  console.log('    "url": "http://<host>:9000",');
  console.log('    "api_key": "<api_key>",');
  console.log('    "endpoint_id": 2');
  console.log('  }');
  console.log('');
  console.log('Examples:');
  console.log('  node portainerce.js stacks list --config ../data/hosts/vllm.portainer.json');
  console.log('  node portainerce.js stacks create --name my-stack --file ./compose.yml');
  console.log('  node portainerce.js containers logs llamacpp --tail 50');
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
  const subCommand = args[1];
  const params = parseArgs(args.slice(subCommand && !subCommand.startsWith('--') ? 2 : 1));
  
  // Handle compound commands (stacks list, containers start, etc.)
  const fullCommand = subCommand && !subCommand.startsWith('--') ? `${command}-${subCommand}` : command;
  
  switch (fullCommand) {
    case 'stacks-list': await listStacks(params); break;
    case 'stacks-get': await getStack(params); break;
    case 'stacks-file': await getStackFile(params); break;
    case 'stacks-create': await createStack(params); break;
    case 'stacks-update': await updateStack(params); break;
    case 'stacks-delete': await deleteStack(params); break;
    case 'stacks-start': await startStack(params); break;
    case 'stacks-stop': await stopStack(params); break;
    
    case 'containers-list': await listContainers(params); break;
    case 'containers-get': await getContainer(params); break;
    case 'containers-start': await containerAction(params, 'start'); break;
    case 'containers-stop': await containerAction(params, 'stop'); break;
    case 'containers-restart': await containerAction(params, 'restart'); break;
    case 'containers-logs': await containerLogs(params); break;
    
    case 'endpoints-list': await listEndpoints(params); break;
    
    case 'status': await getStatus(params); break;
    
    case 'help':
    case '--help': help(); break;
    
    default: output({ success: false, error: `Unknown command: ${fullCommand}` });
  }
}

main().catch(err => output({ success: false, error: err.message }));