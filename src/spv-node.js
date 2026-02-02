/**
 * ClawCoin SPV 輕節點
 * 簡單支付驗證 - 不需要完整區塊鏈
 */

const crypto = require('crypto');
const net = require('net');

class SPVNode {
  constructor(trustedPeer) {
    this.trustedPeer = trustedPeer; // {host, port}
    this.blockHeaders = []; // 只儲存區塊頭
    this.watchedAddresses = new Set();
    this.merkleProofs = new Map();
    this.connected = false;
    this.socket = null;
  }

  // 連接到全節點
  async connect() {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.trustedPeer, () => {
        this.connected = true;
        console.log('🔗 SPV 連接到全節點');
        
        // 請求區塊頭
        this.send('getheaders', { startHeight: this.blockHeaders.length });
        resolve();
      });

      this.socket.on('data', (data) => this.handleMessage(data));
      this.socket.on('error', reject);
      this.socket.on('close', () => { this.connected = false; });
    });
  }

  send(type, payload) {
    if (this.socket && this.connected) {
      this.socket.write(JSON.stringify({ type, payload }) + '\n');
    }
  }

  handleMessage(data) {
    try {
      const messages = data.toString().split('\n').filter(m => m);
      for (const msg of messages) {
        const { type, payload } = JSON.parse(msg);
        this.processMessage(type, payload);
      }
    } catch (e) {
      // 忽略解析錯誤
    }
  }

  processMessage(type, payload) {
    switch (type) {
      case 'headers':
        this.receiveHeaders(payload);
        break;
      case 'merkleblock':
        this.receiveMerkleBlock(payload);
        break;
      case 'tx':
        this.receiveTransaction(payload);
        break;
    }
  }

  // 接收區塊頭
  receiveHeaders(headers) {
    for (const header of headers) {
      // 驗證區塊頭鏈接
      if (this.blockHeaders.length > 0) {
        const lastHeader = this.blockHeaders[this.blockHeaders.length - 1];
        if (header.previousHash !== lastHeader.hash) {
          console.log('❌ 區塊頭鏈接錯誤');
          continue;
        }
      }
      
      // 驗證工作量證明
      if (!this.verifyPoW(header)) {
        console.log('❌ PoW 驗證失敗');
        continue;
      }
      
      this.blockHeaders.push(header);
    }
    
    console.log(`📦 同步區塊頭: ${this.blockHeaders.length}`);
  }

  // 驗證工作量證明
  verifyPoW(header) {
    const target = '0'.repeat(header.difficulty);
    return header.hash.startsWith(target);
  }

  // 接收 Merkle Block（包含 Merkle 證明）
  receiveMerkleBlock(block) {
    const { header, merkleRoot, txids, flags, hashes } = block;
    
    // 驗證 Merkle 證明
    const calculatedRoot = this.verifyMerkleProof(txids, flags, hashes);
    
    if (calculatedRoot === header.merkleRoot) {
      console.log(`✅ Merkle 證明有效: 區塊 #${header.height}`);
      
      // 儲存證明
      for (const txid of txids) {
        this.merkleProofs.set(txid, {
          blockHeight: header.height,
          blockHash: header.hash,
          verified: true
        });
      }
    }
  }

  // 驗證 Merkle 證明
  verifyMerkleProof(txids, flags, hashes) {
    // 簡化版 Merkle 證明驗證
    if (hashes.length === 1) return hashes[0];
    
    const nextLevel = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = hashes[i + 1] || hashes[i];
      const combined = crypto.createHash('sha256')
        .update(left + right)
        .digest('hex');
      nextLevel.push(combined);
    }
    
    return this.verifyMerkleProof(txids, flags, nextLevel);
  }

  // 監視地址
  watchAddress(address) {
    this.watchedAddresses.add(address);
    
    // 通知全節點我們關注這個地址
    if (this.connected) {
      this.send('filteradd', { address });
    }
  }

  // 接收相關交易
  receiveTransaction(tx) {
    // 檢查是否與我們監視的地址相關
    const isRelevant = tx.outputs.some(out => 
      Array.from(this.watchedAddresses).some(addr => 
        out.scriptPubKey.includes(addr)
      )
    );
    
    if (isRelevant) {
      console.log(`💸 收到相關交易: ${tx.txid}`);
      this.onTransaction?.(tx);
    }
  }

  // 驗證交易是否在區塊鏈中
  verifyTransaction(txid) {
    const proof = this.merkleProofs.get(txid);
    if (!proof) {
      return { verified: false, error: '找不到 Merkle 證明' };
    }
    
    // 計算確認數
    const confirmations = this.blockHeaders.length - proof.blockHeight;
    
    return {
      verified: true,
      blockHeight: proof.blockHeight,
      confirmations,
      secure: confirmations >= 6 // 6 確認被認為安全
    };
  }

  // 獲取餘額（通過全節點）
  async getBalance(address) {
    return new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'balance') {
          resolve(msg.payload.balance);
        }
      };
      
      this.socket?.once('data', handler);
      this.send('getbalance', { address });
    });
  }

  // 發送交易
  async broadcastTransaction(tx) {
    return new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'txack') {
          resolve({ success: true, txid: msg.payload.txid });
        }
      };
      
      this.socket?.once('data', handler);
      this.send('tx', { tx });
    });
  }

  // 獲取同步狀態
  getStatus() {
    return {
      connected: this.connected,
      headerHeight: this.blockHeaders.length,
      watchedAddresses: this.watchedAddresses.size,
      verifiedTxs: this.merkleProofs.size
    };
  }
}

module.exports = SPVNode;
