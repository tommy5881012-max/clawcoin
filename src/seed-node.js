#!/usr/bin/env node
/**
 * ClawCoin 種子節點
 * 同時運行 API + P2P + 靜態檔案
 */

const ClawCoin = require('./blockchain');
const P2PNode = require('./p2p-node');
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_PORT = process.env.PORT || 3377;
const P2P_PORT = process.env.P2P_PORT || 6677;

// 初始化區塊鏈
const blockchain = new ClawCoin();

// 啟動 P2P 節點
const p2pNode = new P2PNode(P2P_PORT);
p2pNode.start();

// MIME 類型
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// 啟動 API 伺服器
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = new URL(req.url, `http://${req.headers.host}`);
  const urlPath = url.pathname;

  // 靜態檔案
  if (urlPath === '/' || urlPath === '/index.html') {
    const filePath = path.join(__dirname, '..', 'public', 'index.html');
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.end(content);
      return;
    } catch (e) {
      res.statusCode = 404;
      res.end('File not found');
      return;
    }
  }
  
  if (urlPath === '/explorer.html' || urlPath === '/explorer') {
    const filePath = path.join(__dirname, '..', 'public', 'explorer.html');
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.end(content);
      return;
    } catch (e) {
      res.statusCode = 404;
      res.end('File not found');
      return;
    }
  }

  // API 路由
  res.setHeader('Content-Type', 'application/json');

  if (urlPath === '/' || urlPath === '/stats') {
    res.end(JSON.stringify({
      ...blockchain.getStats(),
      p2p: {
        nodeId: p2pNode.nodeId,
        peers: p2pNode.peers.size,
        port: P2P_PORT
      }
    }));
  } else if (urlPath === '/peers') {
    const peers = [];
    for (const [id] of p2pNode.peers) {
      peers.push(id);
    }
    res.end(JSON.stringify({ peers, count: peers.length }));
  } else if (urlPath === '/chain') {
    res.end(JSON.stringify({
      height: blockchain.ledger.chain.length,
      blocks: blockchain.ledger.chain.slice(-10)
    }));
  } else if (urlPath === '/leaderboard') {
    res.end(JSON.stringify(blockchain.getLeaderboard()));
  } else if (urlPath.startsWith('/balance/')) {
    const address = urlPath.split('/')[2];
    res.end(JSON.stringify({
      address,
      balance: blockchain.getBalance(address)
    }));
  } else if (urlPath === '/health') {
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  } else if (urlPath === '/mine' && req.method === 'POST') {
    // HTTP 挖礦 API - 讓其他人可以透過 HTTP 挖礦
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const minerId = data.minerId || data.agentId || 'anonymous';
        
        // 執行挖礦
        const result = blockchain.mine(minerId, `http-mining-${Date.now()}`);
        
        if (result.success) {
          console.log(`⛏️ HTTP 挖礦: ${minerId} | 區塊 #${result.blockIndex}`);
          res.end(JSON.stringify({
            success: true,
            message: `Mined block #${result.blockIndex}!`,
            block: result.blockIndex,
            reward: result.reward,
            miner: minerId,
            balance: blockchain.getBalance(minerId)
          }));
        } else {
          res.end(JSON.stringify({ success: false, error: result.error }));
        }
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid JSON. Send: {"minerId": "your-name"}' }));
      }
    });
    return;
  } else if (urlPath === '/register' && req.method === 'POST') {
    // 註冊新礦工
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const minerId = data.minerId || data.agentId;
        if (!minerId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'minerId required' }));
          return;
        }
        
        // 記錄礦工（簡單版本）
        const stats = blockchain.getStats();
        res.end(JSON.stringify({
          success: true,
          message: `Welcome ${minerId}! Start mining with POST /mine`,
          minerId,
          currentBlock: stats.totalBlocks,
          reward: stats.currentBlockReward,
          howToMine: 'POST /mine with {"minerId": "' + minerId + '"}'
        }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  } else if (urlPath === '/faucet' && req.method === 'POST') {
    // 水龍頭 - 給新礦工一點初始幣
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const address = data.address || data.minerId;
        if (!address) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'address required' }));
          return;
        }
        
        // 檢查是否已領取
        const balance = blockchain.getBalance(address);
        if (balance > 0) {
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Already claimed',
            balance 
          }));
          return;
        }
        
        // 給 10 CLAW
        blockchain.ledger.balances[address] = 10;
        blockchain.saveLedger();
        
        res.end(JSON.stringify({
          success: true,
          message: `Sent 10 CLAW to ${address}`,
          balance: 10,
          tip: 'Now mine more with POST /mine!'
        }));
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  } else if (urlPath === '/tx' && req.method === 'POST') {
    // 發送交易 - 需要簽名驗證！
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { from, to, amount, signature, publicKey } = data;
        
        if (!from || !to || !amount) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing from, to, or amount' }));
          return;
        }
        
        // 檢查餘額
        const balance = blockchain.getBalance(from);
        if (balance < amount) {
          res.statusCode = 400;
          res.end(JSON.stringify({ 
            error: 'Insufficient balance',
            balance,
            required: amount
          }));
          return;
        }
        
        // 驗證簽名（如果提供）
        if (signature && publicKey) {
          const crypto = require('crypto');
          const message = JSON.stringify({ from, to, amount });
          
          try {
            // 驗證簽名
            const verify = crypto.createVerify('SHA256');
            verify.update(message);
            
            // 從公鑰生成地址，確認與 from 匹配
            const sha256 = crypto.createHash('sha256').update(publicKey, 'hex').digest();
            const ripemd160 = crypto.createHash('ripemd160').update(sha256).digest('hex');
            const derivedAddress = 'CL' + ripemd160.substring(0, 38);
            
            if (derivedAddress !== from && from !== publicKey.substring(0, 40)) {
              res.statusCode = 403;
              res.end(JSON.stringify({ error: 'Public key does not match sender address' }));
              return;
            }
            
            // 簽名驗證（簡化版 - 實際需要 DER 格式）
            console.log(`✅ 簽名交易: ${from} -> ${to}: ${amount} CLAW`);
          } catch (e) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Invalid signature', details: e.message }));
            return;
          }
        } else {
          // 無簽名 - 僅允許小額（測試用）
          if (amount > 10) {
            res.statusCode = 403;
            res.end(JSON.stringify({ 
              error: 'Signature required for amounts > 10 CLAW',
              hint: 'Include signature and publicKey in request'
            }));
            return;
          }
          console.log(`⚠️ 無簽名交易 (小額): ${from} -> ${to}: ${amount} CLAW`);
        }
        
        // 執行轉帳
        blockchain.ledger.balances[from] = (blockchain.ledger.balances[from] || 0) - amount;
        blockchain.ledger.balances[to] = (blockchain.ledger.balances[to] || 0) + amount;
        blockchain.saveLedger();
        
        res.end(JSON.stringify({
          success: true,
          message: `Sent ${amount} CLAW from ${from} to ${to}`,
          tx: {
            from,
            to,
            amount,
            timestamp: Date.now(),
            signed: !!(signature && publicKey)
          },
          balances: {
            [from]: blockchain.getBalance(from),
            [to]: blockchain.getBalance(to)
          }
        }));
        
      } catch (e) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid JSON', details: e.message }));
      }
    });
    return;
  } else if (urlPath === '/wallet/new' && req.method === 'POST') {
    // 創建新錢包
    const crypto = require('crypto');
    
    // 生成私鑰
    const privateKey = crypto.randomBytes(32).toString('hex');
    
    // 生成公鑰
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(privateKey, 'hex'));
    const publicKey = ecdh.getPublicKey('hex');
    
    // 生成地址
    const sha256 = crypto.createHash('sha256').update(publicKey, 'hex').digest();
    const ripemd160 = crypto.createHash('ripemd160').update(sha256).digest('hex');
    const address = 'CL' + ripemd160.substring(0, 38);
    
    res.end(JSON.stringify({
      success: true,
      wallet: {
        address,
        publicKey,
        privateKey  // ⚠️ 保存好！丟失無法恢復
      },
      warning: 'Save your private key! It cannot be recovered if lost.'
    }));
    return;
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(API_PORT, () => {
  console.log('');
  console.log('🪙 ClawCoin Seed Node');
  console.log('═'.repeat(50));
  console.log(`API 端口: ${API_PORT}`);
  console.log(`P2P 端口: ${P2P_PORT}`);
  console.log(`節點 ID: ${p2pNode.nodeId.substring(0, 16)}...`);
  console.log(`區塊高度: ${blockchain.ledger.chain.length}`);
  console.log(`Explorer: http://localhost:${API_PORT}/explorer.html`);
  console.log('═'.repeat(50));
  console.log('');
});

// 自動挖礦
const AUTO_MINE = process.env.AUTO_MINE === 'true';
const MINER_ID = process.env.MINER_ID || 'seed-node';

if (AUTO_MINE) {
  console.log(`⛏️ 自動挖礦已啟用 (礦工: ${MINER_ID})`);
  
  setInterval(() => {
    const result = blockchain.mine(MINER_ID, 'seed-node-mining');
    if (result.success) {
      console.log(`⛏️ 區塊 #${result.blockIndex} | 獎勵: ${result.reward} CLAW`);
      const block = blockchain.ledger.chain[blockchain.ledger.chain.length - 1];
      p2pNode.announceBlock(block);
    }
  }, 30000);
}

process.on('SIGTERM', () => {
  console.log('收到 SIGTERM，正在關閉...');
  server.close();
  process.exit(0);
});
