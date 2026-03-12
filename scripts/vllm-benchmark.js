/**
 * vLLM 推理速度测试脚本
 * 测试单并发下的 tokens/s 性能
 */

const http = require('http');

// 配置
const CONFIG = {
  host: '10.41.24.146',
  port: 8000,
  model: '/models/Qwen/Qwen3___5-35B-A3B-GPTQ-Int4',
  testPrompts: [
    '请写一篇关于人工智能的短文，大约200字。',
    'What is the capital of France? Please explain in detail.',
    '请用中文解释什么是机器学习，并举例说明其应用场景。',
    'Write a short story about a robot learning to paint.',
    '请计算 123 * 456 并解释计算过程。'
  ],
  maxTokens: 256,
  numRuns: 3  // 每个提示词运行的次数
};

/**
 * 发送 chat completion 请求
 */
function chatCompletion(messages, maxTokens) {
  return new Promise((resolve, reject) => {
    const requestData = JSON.stringify({
      model: CONFIG.model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0.7
    });

    const options = {
      hostname: CONFIG.host,
      port: CONFIG.port,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const startTime = Date.now();
    let responseData = '';

    const req = http.request(options, (res) => {
      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        const endTime = Date.now();
        try {
          const response = JSON.parse(responseData);
          resolve({
            success: true,
            response: response,
            latency: endTime - startTime,
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
            totalTokens: response.usage?.total_tokens || 0
          });
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Request error: ${e.message}`));
    });

    req.write(requestData);
    req.end();
  });
}

/**
 * 运行单次测试
 */
async function runSingleTest(prompt, maxTokens, runIndex) {
  console.log(`\n  Run ${runIndex + 1}:`);
  console.log(`  Prompt: "${prompt.substring(0, 50)}..."`);
  
  const messages = [{ role: 'user', content: prompt }];
  
  const result = await chatCompletion(messages, maxTokens);
  
  const tokensPerSecond = result.completionTokens > 0 
    ? (result.completionTokens / (result.latency / 1000)).toFixed(2)
    : 0;
  
  console.log(`  Latency: ${result.latency}ms`);
  console.log(`  Prompt tokens: ${result.promptTokens}`);
  console.log(`  Completion tokens: ${result.completionTokens}`);
  console.log(`  Tokens/s: ${tokensPerSecond}`);
  
  return {
    latency: result.latency,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    tokensPerSecond: parseFloat(tokensPerSecond)
  };
}

/**
 * 运行完整测试
 */
async function runBenchmark() {
  console.log('========================================');
  console.log('vLLM Inference Speed Benchmark');
  console.log('========================================');
  console.log(`\nConfiguration:`);
  console.log(`  Host: ${CONFIG.host}:${CONFIG.port}`);
  console.log(`  Model: ${CONFIG.model}`);
  console.log(`  Max tokens: ${CONFIG.maxTokens}`);
  console.log(`  Test prompts: ${CONFIG.testPrompts.length}`);
  console.log(`  Runs per prompt: ${CONFIG.numRuns}`);
  
  const allResults = [];
  
  for (let i = 0; i < CONFIG.testPrompts.length; i++) {
    const prompt = CONFIG.testPrompts[i];
    console.log(`\n----------------------------------------`);
    console.log(`Test ${i + 1}/${CONFIG.testPrompts.length}:`);
    
    for (let j = 0; j < CONFIG.numRuns; j++) {
      try {
        const result = await runSingleTest(prompt, CONFIG.maxTokens, j);
        allResults.push(result);
        
        // 短暂延迟，避免过载
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`  Error: ${error.message}`);
      }
    }
  }
  
  // 计算统计数据
  if (allResults.length > 0) {
    const avgTokensPerSecond = allResults.reduce((sum, r) => sum + r.tokensPerSecond, 0) / allResults.length;
    const avgLatency = allResults.reduce((sum, r) => sum + r.latency, 0) / allResults.length;
    const avgCompletionTokens = allResults.reduce((sum, r) => sum + r.completionTokens, 0) / allResults.length;
    const minTokensPerSecond = Math.min(...allResults.map(r => r.tokensPerSecond));
    const maxTokensPerSecond = Math.max(...allResults.map(r => r.tokensPerSecond));
    
    console.log('\n========================================');
    console.log('Benchmark Results Summary');
    console.log('========================================');
    console.log(`Total tests: ${allResults.length}`);
    console.log(`\nLatency:`);
    console.log(`  Average: ${avgLatency.toFixed(0)}ms`);
    console.log(`\nCompletion tokens:`);
    console.log(`  Average: ${avgCompletionTokens.toFixed(1)}`);
    console.log(`\nTokens/second:`);
    console.log(`  Average: ${avgTokensPerSecond.toFixed(2)}`);
    console.log(`  Min: ${minTokensPerSecond.toFixed(2)}`);
    console.log(`  Max: ${maxTokensPerSecond.toFixed(2)}`);
    console.log('\n========================================');
  }
}

// 运行测试
runBenchmark().catch(console.error);