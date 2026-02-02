/**
 * ClawCoin DNS Seeds & 節點發現
 * 自動發現網路節點
 */

const dns = require('dns');
const net = require('net');
const crypto = require('crypto');

// 預設 DNS Seeds（模擬）
const DEFAULT_DNS_SEEDS = [
  'seed.clawcoin.local',
  'dnsseed.clawcoin.local',
  'seed.claw.local'
];

// 硬編碼種子節點（fallback）
const HARDCODED_SEEDS = [
  { host: '127.0.0.1', port: 6677 },
  // 可以添加更多已知節點
];

class NodeDiscovery {
  constructor(options = {}) {
    this.dnsSeeds = options.dnsSeeds || DEFAULT_DNS_SEEDS;
    this.port = options.port || 6677;
    this.knownNodes = new Map(); // address -> nodeInfo
    this.activeNodes = new Set();
    this.bannedNodes = new Set();
    this.maxNodes = options.maxNodes || 125;
    this.minNodes = options.minNodes || 8;
  }

  // ========== DNS 發現 ==========

  // 從 DNS 種子獲取節點
  async discoverFromDNS() {
    const discovered = [];

    for (const seed of this.dnsSeeds) {
      try {
        const addresses = await this.resolveDNS(seed);
        for (const addr of addresses) {
          discovered.push({ host: addr, port: this.port, source: 'dns' });
        }
      } catch (e) {
        // DNS 解析失敗，繼續下一個
      }
    }

    return discovered;
  }

  resolveDNS(hostname) {
    return new Promise((resolve, reject) => {
      dns.resolve4(hostname, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses || []);
      });
    });
  }

  // ========== 節點交換 ==========

  // 請求對方的已知節點
  async requestPeers(connection) {
    return new Promise((resolve) => {
      connection.write(JSON.stringify({ type: 'getaddr' }) + '\n');
      
      const handler = (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'addr') {
            resolve(msg.nodes || []);
          }
        } catch (e) {
          resolve([]);
        }
      };

      connection.once('data', handler);
      setTimeout(() => resolve([]), 5000);
    });
  }

  // 回應節點請求
  handleGetAddr() {
    const nodes = [];
    for (const [addr, info] of this.knownNodes) {
      if (!this.bannedNodes.has(addr) && info.lastSeen > Date.now() - 3600000) {
        nodes.push({
          host: info.host,
          port: info.port,
          services: info.services,
          lastSeen: info.lastSeen
        });
      }
    }
    
    // 隨機返回最多 1000 個節點
    return nodes.sort(() => Math.random() - 0.5).slice(0, 1000);
  }

  // ========== 節點管理 ==========

  // 添加節點
  addNode(host, port, services = 1) {
    const addr = `${host}:${port}`;
    
    if (this.bannedNodes.has(addr)) {
      return false;
    }

    this.knownNodes.set(addr, {
      host,
      port,
      services,
      lastSeen: Date.now(),
      lastAttempt: 0,
      failures: 0
    });

    return true;
  }

  // 標記節點為活躍
  markActive(host, port) {
    const addr = `${host}:${port}`;
    this.activeNodes.add(addr);
    
    const info = this.knownNodes.get(addr);
    if (info) {
      info.lastSeen = Date.now();
      info.failures = 0;
    }
  }

  // 標記連接失敗
  markFailed(host, port) {
    const addr = `${host}:${port}`;
    this.activeNodes.delete(addr);
    
    const info = this.knownNodes.get(addr);
    if (info) {
      info.failures++;
      info.lastAttempt = Date.now();
      
      // 多次失敗則暫時禁止
      if (info.failures >= 10) {
        this.bannedNodes.add(addr);
      }
    }
  }

  // 禁止節點
  banNode(host, port, reason = '') {
    const addr = `${host}:${port}`;
    this.bannedNodes.add(addr);
    this.activeNodes.delete(addr);
    console.log(`🚫 禁止節點: ${addr} - ${reason}`);
  }

  // ========== 連接管理 ==========

  // 獲取需要連接的節點
  getNodesToConnect() {
    const needed = this.minNodes - this.activeNodes.size;
    if (needed <= 0) return [];

    const candidates = [];
    const now = Date.now();

    for (const [addr, info] of this.knownNodes) {
      if (this.activeNodes.has(addr)) continue;
      if (this.bannedNodes.has(addr)) continue;
      if (info.lastAttempt > now - 60000) continue; // 1 分鐘內嘗試過

      candidates.push({
        ...info,
        score: this.calculateNodeScore(info)
      });
    }

    // 按分數排序，選擇最好的
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, needed);
  }

  calculateNodeScore(info) {
    let score = 100;
    
    // 最近見過的加分
    const hoursSinceLastSeen = (Date.now() - info.lastSeen) / 3600000;
    score -= hoursSinceLastSeen * 2;
    
    // 失敗次數減分
    score -= info.failures * 10;
    
    return Math.max(0, score);
  }

  // 嘗試連接到節點
  async tryConnect(host, port, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      }, timeout);

      socket.on('connect', () => {
        clearTimeout(timer);
        this.markActive(host, port);
        resolve(socket);
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        this.markFailed(host, port);
        reject(err);
      });
    });
  }

  // ========== 啟動發現 ==========

  async bootstrap() {
    console.log('🔍 開始節點發現...');

    // 1. 硬編碼種子節點
    for (const seed of HARDCODED_SEEDS) {
      this.addNode(seed.host, seed.port);
    }

    // 2. DNS 發現
    try {
      const dnsNodes = await this.discoverFromDNS();
      for (const node of dnsNodes) {
        this.addNode(node.host, node.port);
      }
      console.log(`📡 DNS 發現: ${dnsNodes.length} 個節點`);
    } catch (e) {
      console.log('⚠️ DNS 發現失敗，使用硬編碼節點');
    }

    console.log(`📊 已知節點: ${this.knownNodes.size}`);
    return this.knownNodes.size;
  }

  // 獲取狀態
  getStatus() {
    return {
      known: this.knownNodes.size,
      active: this.activeNodes.size,
      banned: this.bannedNodes.size,
      seeds: this.dnsSeeds.length
    };
  }
}

module.exports = NodeDiscovery;
