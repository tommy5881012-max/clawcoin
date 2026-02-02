/**
 * ClawCoin Server - 中央節點 API
 * 讓其他 AI Agent 加入網路
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const ClawCoin = require('./blockchain');

const PORT = process.env.CLAWCOIN_PORT || 3377;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const coin = new ClawCoin();

// 簡單路由
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// API 路由
const routes = {
  // 健康檢查
  'GET /': () => ({
    name: 'ClawCoin Network',
    version: '2.0.0',
    rules: 'bitcoin',
    status: 'online',
    timestamp: Date.now()
  }),

  // 統計
  'GET /stats': () => coin.getStats(),

  // 排行榜
  'GET /leaderboard': () => coin.getLeaderboard(20),

  // 查詢餘額
  'GET /balance/:agentId': (params) => {
    const balance = coin.getBalance(params.agentId);
    const agent = coin.getAgent(params.agentId);
    return { agentId: params.agentId, balance, agent };
  },

  // 註冊 Agent
  'POST /register': async (params, body) => {
    const { agentId, name, role } = body;
    if (!agentId || !name) {
      return { success: false, error: '需要 agentId 和 name' };
    }
    return coin.registerAgent(agentId, name, role || 'miner');
  },

  // 挖礦
  'POST /mine': async (params, body) => {
    const { agentId, taskProof } = body;
    if (!agentId) {
      return { success: false, error: '需要 agentId' };
    }
    return coin.mine(agentId, taskProof || 'remote-mining');
  },

  // 轉帳
  'POST /transfer': async (params, body) => {
    const { from, to, amount, memo } = body;
    if (!from || !to || !amount) {
      return { success: false, error: '需要 from, to, amount' };
    }
    return coin.transfer(from, to, parseFloat(amount), memo || '');
  },

  // 獲取區塊鏈
  'GET /chain': () => ({
    length: coin.ledger.chain.length,
    chain: coin.ledger.chain.slice(-50) // 最近 50 個區塊
  }),

  // 驗證區塊鏈
  'GET /validate': () => coin.validateChain(),

  // 獲取 Agent 資訊
  'GET /agent/:agentId': (params) => {
    const agent = coin.getAgent(params.agentId);
    if (!agent) {
      return { success: false, error: 'Agent 不存在' };
    }
    return { 
      success: true, 
      agent,
      balance: coin.getBalance(params.agentId)
    };
  }
};

// 路由匹配
function matchRoute(method, url) {
  for (const [pattern, handler] of Object.entries(routes)) {
    const [routeMethod, routePath] = pattern.split(' ');
    if (method !== routeMethod) continue;

    const routeParts = routePath.split('/');
    const urlParts = url.split('?')[0].split('/');

    if (routeParts.length !== urlParts.length) continue;

    const params = {};
    let match = true;

    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = urlParts[i];
      } else if (routeParts[i] !== urlParts[i]) {
        match = false;
        break;
      }
    }

    if (match) return { handler, params };
  }
  return null;
}

// 伺服器
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // 靜態檔案服務
  const urlPath = req.url.split('?')[0];
  if (req.method === 'GET' && (urlPath === '/' || urlPath === '/index.html')) {
    const htmlPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(htmlPath));
      return;
    }
  }

  const route = matchRoute(req.method, req.url);
  
  if (!route) {
    json(res, { error: 'Not Found' }, 404);
    return;
  }

  try {
    const body = await parseBody(req);
    const result = await route.handler(route.params, body);
    json(res, result);
  } catch (e) {
    json(res, { error: e.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log('🪙 ClawCoin Server v2.0');
  console.log('═'.repeat(40));
  console.log(`🌐 http://localhost:${PORT}`);
  console.log('');
  console.log('API 端點:');
  console.log('  GET  /              - 狀態');
  console.log('  GET  /stats         - 統計');
  console.log('  GET  /leaderboard   - 排行榜');
  console.log('  GET  /balance/:id   - 查餘額');
  console.log('  GET  /agent/:id     - Agent 資訊');
  console.log('  POST /register      - 註冊');
  console.log('  POST /mine          - 挖礦');
  console.log('  POST /transfer      - 轉帳');
  console.log('');
  console.log('等待連接...');
});
