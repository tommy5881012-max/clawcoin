/**
 * ClawCoin P2P Network Node
 * 多節點去中心化網路
 */

const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ClawCoin = require('./blockchain');

const DEFAULT_PORT = 6677;
const PEERS_FILE = path.join(__dirname, '..', 'data', 'peers.json');

class P2PNode {
  constructor(port = DEFAULT_PORT) {
    this.port = port;
    this.nodeId = crypto.randomBytes(16).toString('hex');
    this.peers = new Map(); // nodeId -> socket
    this.knownPeers = this.loadPeers();
    this.blockchain = new ClawCoin();
    this.server = null;
    this.handlers = {};
    
    this.setupHandlers();
  }

  // 載入已知節點
  loadPeers() {
    try {
      return JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8'));
    } catch {
      return [];
    }
  }

  savePeers() {
    const peers = Array.from(this.knownPeers);
    fs.writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2));
  }

  // 訊息協議
  setupHandlers() {
    // 握手
    this.handlers['handshake'] = (data, socket) => {
      const { nodeId, port, chainLength } = data;
      this.peers.set(nodeId, { socket, port, chainLength });
      
      console.log(`🤝 節點連接: ${nodeId.substring(0, 8)}... (區塊: ${chainLength})`);
      
      // 回應握手
      this.send(socket, 'handshake_ack', {
        nodeId: this.nodeId,
        chainLength: this.blockchain.ledger.chain.length
      });
      
      // 如果對方鏈更長，請求同步
      if (chainLength > this.blockchain.ledger.chain.length) {
        this.send(socket, 'request_chain', {});
      }
    };

    // 握手確認
    this.handlers['handshake_ack'] = (data, socket) => {
      const { nodeId, chainLength } = data;
      this.peers.set(nodeId, { socket, chainLength });
      
      if (chainLength > this.blockchain.ledger.chain.length) {
        this.send(socket, 'request_chain', {});
      }
    };

    // 請求區塊鏈
    this.handlers['request_chain'] = (data, socket) => {
      this.send(socket, 'chain_response', {
        chain: this.blockchain.ledger.chain,
        balances: this.blockchain.ledger.balances,
        agents: this.blockchain.ledger.agents,
        stats: this.blockchain.ledger.stats,
        miningStats: this.blockchain.ledger.miningStats
      });
    };

    // 接收區塊鏈
    this.handlers['chain_response'] = (data) => {
      const { chain, balances, agents, stats, miningStats } = data;
      
      if (chain.length > this.blockchain.ledger.chain.length) {
        // 驗證鏈
        if (this.validateChain(chain)) {
          console.log(`📥 同步區塊鏈: ${this.blockchain.ledger.chain.length} → ${chain.length}`);
          this.blockchain.ledger.chain = chain;
          this.blockchain.ledger.balances = balances;
          this.blockchain.ledger.agents = agents;
          this.blockchain.ledger.stats = stats;
          this.blockchain.ledger.miningStats = miningStats;
          this.blockchain.saveLedger();
        } else {
          console.log('❌ 收到無效的區塊鏈');
        }
      }
    };

    // 新區塊廣播
    this.handlers['new_block'] = (data) => {
      const { block } = data;
      const lastBlock = this.blockchain.ledger.chain[this.blockchain.ledger.chain.length - 1];
      
      // 驗證區塊
      if (block.previousHash === lastBlock.hash && block.index === lastBlock.index + 1) {
        console.log(`📦 收到新區塊 #${block.index} 來自 ${block.miner}`);
        this.blockchain.ledger.chain.push(block);
        
        // 更新餘額
        if (block.reward) {
          this.blockchain.ledger.balances[block.miner] = 
            (this.blockchain.ledger.balances[block.miner] || 0) + block.reward;
          this.blockchain.ledger.stats.circulatingSupply += block.reward;
          this.blockchain.ledger.stats.totalBlocks++;
        }
        
        this.blockchain.saveLedger();
        
        // 轉發給其他節點
        this.broadcast('new_block', { block }, data.originNode);
      }
    };

    // 新交易廣播
    this.handlers['new_transaction'] = (data) => {
      const { tx } = data;
      console.log(`💸 收到交易: ${tx.from} → ${tx.to}: ${tx.amount} CLAW`);
      // 可以加入交易池 (mempool) 處理
    };

    // Ping/Pong 保活
    this.handlers['ping'] = (data, socket) => {
      this.send(socket, 'pong', { timestamp: Date.now() });
    };

    this.handlers['pong'] = () => {};
  }

  // 驗證區塊鏈
  validateChain(chain) {
    for (let i = 1; i < chain.length; i++) {
      if (chain[i].previousHash !== chain[i - 1].hash) {
        return false;
      }
    }
    return true;
  }

  // 發送訊息
  send(socket, type, data) {
    const message = JSON.stringify({ type, data, from: this.nodeId }) + '\n';
    socket.write(message);
  }

  // 廣播給所有節點
  broadcast(type, data, excludeNode = null) {
    for (const [nodeId, peer] of this.peers) {
      if (nodeId !== excludeNode && peer.socket) {
        this.send(peer.socket, type, { ...data, originNode: this.nodeId });
      }
    }
  }

  // 處理接收的訊息
  handleMessage(message, socket) {
    try {
      const { type, data, from } = JSON.parse(message);
      const handler = this.handlers[type];
      if (handler) {
        handler(data, socket, from);
      }
    } catch (e) {
      // 忽略解析錯誤
    }
  }

  // 啟動伺服器
  start() {
    this.server = net.createServer((socket) => {
      let buffer = '';
      
      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach(line => this.handleMessage(line, socket));
      });

      socket.on('error', () => {});
      socket.on('close', () => {
        // 移除斷開的節點
        for (const [nodeId, peer] of this.peers) {
          if (peer.socket === socket) {
            this.peers.delete(nodeId);
            console.log(`👋 節點離開: ${nodeId.substring(0, 8)}...`);
            break;
          }
        }
      });
    });

    this.server.listen(this.port, () => {
      console.log('🌐 ClawCoin P2P Node');
      console.log('═'.repeat(40));
      console.log(`節點 ID: ${this.nodeId.substring(0, 16)}...`);
      console.log(`監聽端口: ${this.port}`);
      console.log(`區塊高度: ${this.blockchain.ledger.chain.length}`);
      console.log('');
    });

    // 連接已知節點
    this.connectToKnownPeers();

    // 定期 ping
    setInterval(() => {
      this.broadcast('ping', { timestamp: Date.now() });
    }, 30000);

    return this;
  }

  // 連接到節點
  connect(host, port) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        console.log(`🔗 連接到 ${host}:${port}`);
        
        // 發送握手
        this.send(socket, 'handshake', {
          nodeId: this.nodeId,
          port: this.port,
          chainLength: this.blockchain.ledger.chain.length
        });

        // 記住這個節點
        const peerAddr = `${host}:${port}`;
        if (!this.knownPeers.includes(peerAddr)) {
          this.knownPeers.push(peerAddr);
          this.savePeers();
        }

        let buffer = '';
        socket.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();
          lines.forEach(line => this.handleMessage(line, socket));
        });

        socket.on('error', () => {});
        resolve(socket);
      });

      socket.on('error', reject);
    });
  }

  // 連接已知節點
  async connectToKnownPeers() {
    for (const peerAddr of this.knownPeers) {
      const [host, port] = peerAddr.split(':');
      try {
        await this.connect(host, parseInt(port));
      } catch (e) {
        // 連接失敗，繼續下一個
      }
    }
  }

  // 廣播新挖到的區塊
  announceBlock(block) {
    this.broadcast('new_block', { block });
  }

  // 獲取節點狀態
  getStatus() {
    return {
      nodeId: this.nodeId,
      port: this.port,
      peers: this.peers.size,
      chainLength: this.blockchain.ledger.chain.length,
      circulatingSupply: this.blockchain.ledger.stats.circulatingSupply
    };
  }
}

module.exports = P2PNode;
