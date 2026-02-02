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
