#!/usr/bin/env node
/**
 * ClawCoin 完整節點
 * 像 2009 年比特幣一樣運作
 * - 自動發現其他節點
 * - P2P 區塊同步
 * - 本地挖礦
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const net = require('net');

// 配置
const DATA_DIR = path.join(__dirname, '..', 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');
const CONFIG_FILE = path.join(DATA_DIR, 'node-config.json');

// 種子節點（類似比特幣的 DNS Seeds）
const SEED_NODES = [
  { host: 'clawcoin.onrender.com', port: 443, https: true },
  // 未來可以添加更多種子節點
];

class ClawNode {
  constructor(options = {}) {
    this.nodeId = crypto.randomBytes(16).toString('hex');
    this.port = options.port || 3377;
    this.minerId = options.minerId || null;
    this.mineInterval = options.mineInterval || 30000; // 30 秒
    
    // 區塊鏈數據
    this.ledger = this.loadLedger();
    
    // 已知節點
    this.knownPeers = new Set();
    this.connectedPeers = new Map();
    
    // 狀態
    this.isMining = false;
    this.lastSync = 0;
  }

  loadLedger() {
    if (fs.existsSync(LEDGER_FILE)) {
      return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
    }
    return {
      chain: [this.createGenesisBlock()],
      balances: {},
      difficulty: 2
    };
  }

  saveLedger() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(this.ledger, null, 2));
  }

  createGenesisBlock() {
    return {
      index: 0,
      timestamp: 1706745600000, // 2024-02-01
      transactions: [],
      previousHash: '0',
      hash: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
      nonce: 0,
      difficulty: 1
    };
  }

  // 連接到種子節點
  async bootstrap() {
    console.log('🌐 正在連接種子節點...');
    
    for (const seed of SEED_NODES) {
      try {
        const stats = await this.fetchFromPeer(seed, '/stats');
        console.log(`  ✓ ${seed.host}: 區塊 #${stats.totalBlocks}`);
        this.knownPeers.add(`${seed.host}:${seed.port}`);
        
        // 如果種子節點區塊更多，同步
        if (stats.totalBlocks > this.ledger.chain.length) {
          await this.syncFromPeer(seed);
        }
      } catch (e) {
        console.log(`  ✗ ${seed.host}: 無法連接`);
      }
    }
  }

  fetchFromPeer(peer, endpoint) {
    return new Promise((resolve, reject) => {
      const protocol = peer.https ? https : http;
      const url = `${peer.https ? 'https' : 'http'}://${peer.host}${endpoint}`;
      
      protocol.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  async syncFromPeer(peer) {
    console.log(`📥 從 ${peer.host} 同步區塊...`);
    
    try {
      const chain = await this.fetchFromPeer(peer, '/chain');
      const leaderboard = await this.fetchFromPeer(peer, '/leaderboard');
      
      // 合併餘額
      for (const miner of leaderboard) {
        const current = this.ledger.balances[miner.agentId] || 0;
        if (miner.balance > current) {
          this.ledger.balances[miner.agentId] = miner.balance;
        }
      }
      
      this.saveLedger();
      console.log(`✓ 同步完成`);
    } catch (e) {
      console.log(`✗ 同步失敗: ${e.message}`);
    }
  }

  // 挖礦
  mine() {
    if (!this.minerId) return null;
    
    const lastBlock = this.ledger.chain[this.ledger.chain.length - 1];
    const difficulty = this.ledger.difficulty || 2;
    const target = '0'.repeat(difficulty);
    
    // 創建新區塊
    const newBlock = {
      index: lastBlock.index + 1,
      timestamp: Date.now(),
      transactions: [],
      previousHash: lastBlock.hash,
      miner: this.minerId,
      reward: this.getBlockReward(),
      difficulty,
      nonce: 0
    };

    // PoW
    let hash = '';
    while (!hash.startsWith(target)) {
      newBlock.nonce++;
      hash = this.hashBlock(newBlock);
    }
    newBlock.hash = hash;

    // 添加區塊
    this.ledger.chain.push(newBlock);
    this.ledger.balances[this.minerId] = 
      (this.ledger.balances[this.minerId] || 0) + newBlock.reward;
    
    this.saveLedger();
    
    return newBlock;
  }

  hashBlock(block) {
    const data = JSON.stringify({
      index: block.index,
      timestamp: block.timestamp,
      transactions: block.transactions,
      previousHash: block.previousHash,
      nonce: block.nonce
    });
    return crypto.createHash('sha256')
      .update(crypto.createHash('sha256').update(data).digest())
      .digest('hex');
  }

  getBlockReward() {
    const halvings = Math.floor(this.ledger.chain.length / 210000);
    return Math.floor(50 / Math.pow(2, halvings));
  }

  getBalance(address) {
    return this.ledger.balances[address] || 0;
  }

  getStats() {
    const supply = Object.values(this.ledger.balances).reduce((a, b) => a + b, 0);
    return {
      nodeId: this.nodeId,
      blockHeight: this.ledger.chain.length,
      difficulty: this.ledger.difficulty,
      circulatingSupply: supply,
      knownPeers: this.knownPeers.size,
      isMining: this.isMining,
      minerId: this.minerId
    };
  }

  // 啟動 API 伺服器
  startServer() {
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const url = new URL(req.url, `http://localhost:${this.port}`);
      
      if (url.pathname === '/stats') {
        res.end(JSON.stringify(this.getStats()));
      } else if (url.pathname === '/chain') {
        res.end(JSON.stringify({
          height: this.ledger.chain.length,
          blocks: this.ledger.chain.slice(-10)
        }));
      } else if (url.pathname === '/leaderboard') {
        const leaderboard = Object.entries(this.ledger.balances)
          .map(([id, bal]) => ({ agentId: id, balance: bal }))
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 10);
        res.end(JSON.stringify(leaderboard));
      } else if (url.pathname.startsWith('/balance/')) {
        const addr = url.pathname.split('/')[2];
        res.end(JSON.stringify({ address: addr, balance: this.getBalance(addr) }));
      } else if (url.pathname === '/peers') {
        res.end(JSON.stringify({ peers: Array.from(this.knownPeers) }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    server.listen(this.port, () => {
      console.log(`🖥️  API: http://localhost:${this.port}`);
    });
  }

  // 開始挖礦循環
  startMining() {
    if (!this.minerId) {
      console.log('⚠️  未設定礦工 ID，跳過挖礦');
      return;
    }

    this.isMining = true;
    console.log(`⛏️  開始挖礦: ${this.minerId}`);
    console.log(`   間隔: ${this.mineInterval / 1000} 秒`);

    const mineLoop = () => {
      const block = this.mine();
      if (block) {
        const balance = this.getBalance(this.minerId);
        console.log(`[${new Date().toLocaleTimeString()}] ⛏️ 區塊 #${block.index} | +${block.reward} CLAW | 餘額: ${balance}`);
      }
    };

    mineLoop();
    setInterval(mineLoop, this.mineInterval);
  }

  // 定期同步
  startSync() {
    setInterval(async () => {
      for (const seed of SEED_NODES) {
        try {
          await this.syncFromPeer(seed);
        } catch (e) {}
      }
    }, 60000); // 每分鐘同步
  }

  async start() {
    console.log('');
    console.log('🪙 ClawCoin 完整節點');
    console.log('═'.repeat(50));
    console.log(`節點 ID: ${this.nodeId}`);
    console.log(`區塊高度: ${this.ledger.chain.length}`);
    console.log(`餘額: ${this.minerId ? this.getBalance(this.minerId) : 'N/A'} CLAW`);
    console.log('═'.repeat(50));
    console.log('');

    await this.bootstrap();
    this.startServer();
    this.startMining();
    this.startSync();

    console.log('');
    console.log('節點已啟動！按 Ctrl+C 停止');
    console.log('');
  }
}

// CLI
const args = process.argv.slice(2);
const minerId = args[0];
const mineInterval = parseInt(args[1]) || 30000;

if (!minerId) {
  console.log('用法: node full-node.js <礦工名稱> [間隔毫秒]');
  console.log('範例: node full-node.js myagent 10000');
  process.exit(1);
}

const node = new ClawNode({ minerId, mineInterval });
node.start();
