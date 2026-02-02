/**
 * ClawCoin 改進版 P2P 網路
 * 自動發現 + 區塊同步 + 共識
 */

const net = require('net');
const crypto = require('crypto');
const EventEmitter = require('events');

class ImprovedP2PNode extends EventEmitter {
  constructor(port, blockchain) {
    super();
    this.port = port;
    this.nodeId = crypto.randomBytes(32).toString('hex');
    this.blockchain = blockchain;
    this.peers = new Map();
    this.seenBlocks = new Set();
    this.seenTxs = new Set();
    this.syncInProgress = false;
    this.server = null;
    
    // Bootstrap 節點（硬編碼）
    this.bootstrapNodes = [
      // 添加你的雲端節點
    ];
  }

  start() {
    this.server = net.createServer((socket) => {
      this.handleConnection(socket, false);
    });

    this.server.listen(this.port, () => {
      console.log(`🌐 P2P 節點啟動: ${this.port}`);
      console.log(`📍 節點 ID: ${this.nodeId.substring(0, 16)}...`);
      
      // 連接到 bootstrap 節點
      this.connectToBootstrap();
      
      // 定期任務
      this.startPeriodicTasks();
    });

    return this;
  }

  handleConnection(socket, isOutgoing) {
    const peerId = crypto.randomBytes(8).toString('hex');
    let remotePeerId = null;
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this.handleMessage(msg, socket, peerId);
          if (msg.nodeId) remotePeerId = msg.nodeId;
        } catch (e) {
          // 忽略解析錯誤
        }
      }
    });

    socket.on('close', () => {
      this.peers.delete(remotePeerId || peerId);
      this.emit('peer:disconnect', remotePeerId || peerId);
    });

    socket.on('error', () => {
      this.peers.delete(remotePeerId || peerId);
    });

    // 發送握手
    this.send(socket, {
      type: 'handshake',
      nodeId: this.nodeId,
      version: '1.0.0',
      height: this.blockchain.ledger.chain.length,
      bestHash: this.blockchain.ledger.chain[this.blockchain.ledger.chain.length - 1]?.hash
    });
  }

  handleMessage(msg, socket, peerId) {
    switch (msg.type) {
      case 'handshake':
        this.handleHandshake(msg, socket);
        break;
      case 'getblocks':
        this.handleGetBlocks(msg, socket);
        break;
      case 'blocks':
        this.handleBlocks(msg);
        break;
      case 'newblock':
        this.handleNewBlock(msg, socket);
        break;
      case 'newtx':
        this.handleNewTx(msg, socket);
        break;
      case 'getpeers':
        this.handleGetPeers(socket);
        break;
      case 'peers':
        this.handlePeers(msg);
        break;
      case 'ping':
        this.send(socket, { type: 'pong', timestamp: Date.now() });
        break;
    }
  }

  handleHandshake(msg, socket) {
    const { nodeId, height, bestHash } = msg;
    
    // 避免自連接
    if (nodeId === this.nodeId) {
      socket.destroy();
      return;
    }

    this.peers.set(nodeId, {
      socket,
      height,
      bestHash,
      lastSeen: Date.now()
    });

    this.emit('peer:connect', nodeId);

    // 如果對方鏈更長，請求同步
    if (height > this.blockchain.ledger.chain.length) {
      this.requestBlocks(socket, this.blockchain.ledger.chain.length);
    }
  }

  handleGetBlocks(msg, socket) {
    const { fromHeight, limit = 500 } = msg;
    const blocks = this.blockchain.ledger.chain.slice(fromHeight, fromHeight + limit);
    
    this.send(socket, {
      type: 'blocks',
      blocks,
      fromHeight
    });
  }

  handleBlocks(msg) {
    const { blocks, fromHeight } = msg;
    
    if (!blocks || blocks.length === 0) {
      this.syncInProgress = false;
      return;
    }

    // 驗證並添加區塊
    let added = 0;
    for (const block of blocks) {
      if (block.index === this.blockchain.ledger.chain.length) {
        // 簡單驗證
        const lastBlock = this.blockchain.ledger.chain[this.blockchain.ledger.chain.length - 1];
        if (block.previousHash === lastBlock.hash) {
          this.blockchain.ledger.chain.push(block);
          
          // 更新餘額
          if (block.miner && block.reward) {
            this.blockchain.ledger.balances[block.miner] = 
              (this.blockchain.ledger.balances[block.miner] || 0) + block.reward;
          }
          
          added++;
        }
      }
    }

    if (added > 0) {
      this.blockchain.saveLedger();
      console.log(`📥 同步 ${added} 個區塊，高度: ${this.blockchain.ledger.chain.length}`);
      
      // 繼續請求
      for (const [, peer] of this.peers) {
        if (peer.height > this.blockchain.ledger.chain.length) {
          this.requestBlocks(peer.socket, this.blockchain.ledger.chain.length);
          break;
        }
      }
    }

    this.syncInProgress = false;
  }

  handleNewBlock(msg, socket) {
    const { block, nodeId } = msg;
    
    // 避免重複處理
    if (this.seenBlocks.has(block.hash)) return;
    this.seenBlocks.add(block.hash);
    
    // 限制 seen 集合大小
    if (this.seenBlocks.size > 10000) {
      const first = this.seenBlocks.values().next().value;
      this.seenBlocks.delete(first);
    }

    const lastBlock = this.blockchain.ledger.chain[this.blockchain.ledger.chain.length - 1];
    
    // 驗證區塊
    if (block.previousHash === lastBlock.hash && block.index === lastBlock.index + 1) {
      this.blockchain.ledger.chain.push(block);
      
      if (block.miner && block.reward) {
        this.blockchain.ledger.balances[block.miner] = 
          (this.blockchain.ledger.balances[block.miner] || 0) + block.reward;
      }
      
      this.blockchain.saveLedger();
      console.log(`📦 收到新區塊 #${block.index}`);
      
      // 廣播給其他節點
      this.broadcast({
        type: 'newblock',
        block,
        nodeId: this.nodeId
      }, nodeId);

      this.emit('block:new', block);
    }
  }

  handleNewTx(msg, socket) {
    const { tx, nodeId } = msg;
    
    if (this.seenTxs.has(tx.txid)) return;
    this.seenTxs.add(tx.txid);
    
    if (this.seenTxs.size > 50000) {
      const first = this.seenTxs.values().next().value;
      this.seenTxs.delete(first);
    }

    // 添加到 mempool（如果有）
    this.emit('tx:new', tx);
    
    // 廣播
    this.broadcast({
      type: 'newtx',
      tx,
      nodeId: this.nodeId
    }, nodeId);
  }

  handleGetPeers(socket) {
    const peers = [];
    for (const [id, peer] of this.peers) {
      const addr = peer.socket?.remoteAddress;
      const port = peer.socket?.remotePort;
      if (addr && port) {
        peers.push({ nodeId: id, address: addr, port });
      }
    }
    this.send(socket, { type: 'peers', peers });
  }

  handlePeers(msg) {
    // 嘗試連接新節點
    for (const peer of msg.peers || []) {
      if (peer.nodeId !== this.nodeId && !this.peers.has(peer.nodeId)) {
        this.connect(peer.address, peer.port).catch(() => {});
      }
    }
  }

  send(socket, msg) {
    if (socket && !socket.destroyed) {
      socket.write(JSON.stringify(msg) + '\n');
    }
  }

  broadcast(msg, excludeNodeId = null) {
    for (const [nodeId, peer] of this.peers) {
      if (nodeId !== excludeNodeId) {
        this.send(peer.socket, msg);
      }
    }
  }

  requestBlocks(socket, fromHeight) {
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    this.send(socket, { type: 'getblocks', fromHeight, limit: 500 });
  }

  async connect(host, port) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        this.handleConnection(socket, true);
        resolve(socket);
      });
      socket.on('error', reject);
      socket.setTimeout(10000, () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });
    });
  }

  async connectToBootstrap() {
    for (const node of this.bootstrapNodes) {
      try {
        await this.connect(node.host, node.port);
        console.log(`🔗 連接到 ${node.host}:${node.port}`);
      } catch (e) {
        // 連接失敗
      }
    }
  }

  startPeriodicTasks() {
    // Ping 保活
    setInterval(() => {
      this.broadcast({ type: 'ping', timestamp: Date.now() });
    }, 30000);

    // 請求更多節點
    setInterval(() => {
      for (const [, peer] of this.peers) {
        this.send(peer.socket, { type: 'getpeers' });
        break; // 只問一個
      }
    }, 60000);

    // 清理斷開的連接
    setInterval(() => {
      const now = Date.now();
      for (const [nodeId, peer] of this.peers) {
        if (now - peer.lastSeen > 120000) {
          peer.socket?.destroy();
          this.peers.delete(nodeId);
        }
      }
    }, 60000);
  }

  // 廣播新挖到的區塊
  announceBlock(block) {
    this.broadcast({
      type: 'newblock',
      block,
      nodeId: this.nodeId
    });
  }

  // 廣播新交易
  announceTx(tx) {
    this.broadcast({
      type: 'newtx',
      tx,
      nodeId: this.nodeId
    });
  }

  getStatus() {
    return {
      nodeId: this.nodeId,
      port: this.port,
      peers: this.peers.size,
      height: this.blockchain.ledger.chain.length,
      seenBlocks: this.seenBlocks.size,
      seenTxs: this.seenTxs.size
    };
  }
}

module.exports = ImprovedP2PNode;
