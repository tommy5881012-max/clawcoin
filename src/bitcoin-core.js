/**
 * ClawCoin v3.0 - 完整比特幣實現
 * UTXO 模型 + Mempool + Merkle Tree + 手續費
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BLOCKCHAIN_FILE = path.join(DATA_DIR, 'blockchain_v3.json');

// ========== 比特幣參數 ==========
const PARAMS = {
  MAX_SUPPLY: 21000000,
  INITIAL_REWARD: 50,
  HALVING_INTERVAL: 210000,
  BLOCK_TIME_TARGET: 600, // 10 分鐘
  DIFFICULTY_ADJUSTMENT: 2016,
  MAX_BLOCK_SIZE: 1000000, // 1MB
  MIN_TX_FEE: 0.0001,
  COINBASE_MATURITY: 100, // 挖礦獎勵需等 100 區塊才能花
};

// ========== 工具函數 ==========
function sha256(data) {
  return crypto.createHash('sha256').update(
    typeof data === 'string' ? data : JSON.stringify(data)
  ).digest('hex');
}

function doubleSha256(data) {
  return sha256(Buffer.from(sha256(data), 'hex'));
}

// Merkle Tree
function buildMerkleRoot(txids) {
  if (txids.length === 0) return sha256('');
  if (txids.length === 1) return txids[0];
  
  const nextLevel = [];
  for (let i = 0; i < txids.length; i += 2) {
    const left = txids[i];
    const right = txids[i + 1] || txids[i]; // 如果是奇數，複製最後一個
    nextLevel.push(doubleSha256(left + right));
  }
  return buildMerkleRoot(nextLevel);
}

// ========== UTXO 交易 ==========
class Transaction {
  constructor() {
    this.version = 1;
    this.inputs = [];  // [{txid, vout, scriptSig}]
    this.outputs = []; // [{value, scriptPubKey}]
    this.locktime = 0;
  }

  // Coinbase 交易（挖礦獎勵）
  static createCoinbase(minerAddress, reward, blockHeight) {
    const tx = new Transaction();
    tx.inputs = [{
      txid: '0'.repeat(64),
      vout: 0xffffffff,
      scriptSig: `coinbase:${blockHeight}`,
      coinbase: true
    }];
    tx.outputs = [{
      value: reward,
      scriptPubKey: `OP_DUP OP_HASH160 ${minerAddress} OP_EQUALVERIFY OP_CHECKSIG`
    }];
    tx.txid = tx.calculateTxid();
    return tx;
  }

  // 普通交易
  static create(inputs, outputs) {
    const tx = new Transaction();
    tx.inputs = inputs;
    tx.outputs = outputs;
    tx.txid = tx.calculateTxid();
    return tx;
  }

  calculateTxid() {
    return doubleSha256({
      version: this.version,
      inputs: this.inputs,
      outputs: this.outputs,
      locktime: this.locktime
    });
  }

  // 計算交易大小（簡化版）
  getSize() {
    return JSON.stringify(this).length;
  }

  // 獲取總輸出
  getTotalOutput() {
    return this.outputs.reduce((sum, out) => sum + out.value, 0);
  }

  serialize() {
    return {
      txid: this.txid,
      version: this.version,
      inputs: this.inputs,
      outputs: this.outputs,
      locktime: this.locktime
    };
  }
}

// ========== 區塊 ==========
class Block {
  constructor(previousHash, height) {
    this.version = 1;
    this.previousHash = previousHash;
    this.height = height;
    this.timestamp = Date.now();
    this.transactions = [];
    this.merkleRoot = '';
    this.difficulty = 2;
    this.nonce = 0;
    this.hash = '';
  }

  addTransaction(tx) {
    this.transactions.push(tx.serialize());
  }

  calculateMerkleRoot() {
    const txids = this.transactions.map(tx => tx.txid);
    this.merkleRoot = buildMerkleRoot(txids);
    return this.merkleRoot;
  }

  calculateHash() {
    return doubleSha256({
      version: this.version,
      previousHash: this.previousHash,
      merkleRoot: this.merkleRoot,
      timestamp: this.timestamp,
      difficulty: this.difficulty,
      nonce: this.nonce
    });
  }

  // 工作量證明
  mine(difficulty) {
    this.difficulty = difficulty;
    this.calculateMerkleRoot();
    
    const target = '0'.repeat(difficulty);
    while (true) {
      this.hash = this.calculateHash();
      if (this.hash.startsWith(target)) {
        return this;
      }
      this.nonce++;
    }
  }

  getSize() {
    return JSON.stringify(this).length;
  }

  serialize() {
    return {
      version: this.version,
      hash: this.hash,
      previousHash: this.previousHash,
      height: this.height,
      merkleRoot: this.merkleRoot,
      timestamp: this.timestamp,
      difficulty: this.difficulty,
      nonce: this.nonce,
      transactions: this.transactions,
      size: this.getSize()
    };
  }
}

// ========== 區塊鏈 ==========
class Blockchain {
  constructor() {
    this.ensureDataDir();
    this.load();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(BLOCKCHAIN_FILE, 'utf8'));
      this.chain = data.chain;
      this.utxoSet = new Map(Object.entries(data.utxoSet));
      this.mempool = data.mempool || [];
      this.difficulty = data.difficulty || 2;
      this.stats = data.stats;
    } catch {
      this.initGenesis();
    }
  }

  save() {
    const data = {
      chain: this.chain,
      utxoSet: Object.fromEntries(this.utxoSet),
      mempool: this.mempool,
      difficulty: this.difficulty,
      stats: this.stats
    };
    fs.writeFileSync(BLOCKCHAIN_FILE, JSON.stringify(data, null, 2));
  }

  initGenesis() {
    this.chain = [];
    this.utxoSet = new Map();
    this.mempool = [];
    this.difficulty = 2;
    this.stats = {
      totalMined: 0,
      halvings: 0
    };

    // 創世區塊
    const genesis = new Block('0'.repeat(64), 0);
    genesis.timestamp = Date.now();
    genesis.calculateMerkleRoot();
    genesis.hash = genesis.calculateHash();
    this.chain.push(genesis.serialize());
    this.save();
  }

  getLastBlock() {
    return this.chain[this.chain.length - 1];
  }

  getBlockReward() {
    const halvings = Math.floor(this.chain.length / PARAMS.HALVING_INTERVAL);
    return PARAMS.INITIAL_REWARD / Math.pow(2, halvings);
  }

  // ========== UTXO 操作 ==========
  
  getUtxoKey(txid, vout) {
    return `${txid}:${vout}`;
  }

  addUtxo(txid, vout, output, height) {
    const key = this.getUtxoKey(txid, vout);
    this.utxoSet.set(key, {
      txid,
      vout,
      value: output.value,
      scriptPubKey: output.scriptPubKey,
      height,
      spent: false
    });
  }

  spendUtxo(txid, vout) {
    const key = this.getUtxoKey(txid, vout);
    if (this.utxoSet.has(key)) {
      this.utxoSet.delete(key);
      return true;
    }
    return false;
  }

  getBalance(address) {
    let balance = 0;
    for (const [, utxo] of this.utxoSet) {
      if (utxo.scriptPubKey.includes(address)) {
        balance += utxo.value;
      }
    }
    return balance;
  }

  getUtxosForAddress(address) {
    const utxos = [];
    for (const [, utxo] of this.utxoSet) {
      if (utxo.scriptPubKey.includes(address)) {
        utxos.push(utxo);
      }
    }
    return utxos;
  }

  // ========== 交易池 (Mempool) ==========

  addToMempool(tx) {
    // 驗證交易
    if (!this.validateTransaction(tx)) {
      return { success: false, error: '交易驗證失敗' };
    }

    // 檢查手續費
    const fee = this.calculateFee(tx);
    if (fee < PARAMS.MIN_TX_FEE) {
      return { success: false, error: '手續費不足' };
    }

    this.mempool.push({ tx: tx.serialize(), fee, timestamp: Date.now() });
    this.save();
    return { success: true, txid: tx.txid };
  }

  calculateFee(tx) {
    let inputValue = 0;
    for (const input of tx.inputs) {
      const utxo = this.utxoSet.get(this.getUtxoKey(input.txid, input.vout));
      if (utxo) inputValue += utxo.value;
    }
    return inputValue - tx.getTotalOutput();
  }

  validateTransaction(tx) {
    // 檢查輸入是否存在且未花費
    for (const input of tx.inputs) {
      if (input.coinbase) continue;
      const utxo = this.utxoSet.get(this.getUtxoKey(input.txid, input.vout));
      if (!utxo) return false;
    }
    return true;
  }

  // ========== 挖礦 ==========

  mineBlock(minerAddress) {
    const lastBlock = this.getLastBlock();
    const height = this.chain.length;
    const reward = this.getBlockReward();

    // 檢查供應量
    if (this.stats.totalMined >= PARAMS.MAX_SUPPLY) {
      return { success: false, error: '已達最大供應量' };
    }

    const block = new Block(lastBlock.hash, height);
    
    // 添加 Coinbase 交易
    const coinbaseTx = Transaction.createCoinbase(minerAddress, reward, height);
    block.addTransaction(coinbaseTx);

    // 從 mempool 選擇交易（按手續費排序）
    const sortedMempool = [...this.mempool].sort((a, b) => b.fee - a.fee);
    let blockSize = block.getSize();
    const includedTxs = [];

    for (const item of sortedMempool) {
      const txSize = JSON.stringify(item.tx).length;
      if (blockSize + txSize > PARAMS.MAX_BLOCK_SIZE) break;
      
      block.transactions.push(item.tx);
      blockSize += txSize;
      includedTxs.push(item.tx.txid);
    }

    // 挖礦
    block.mine(this.difficulty);

    // 更新 UTXO
    for (const tx of block.transactions) {
      // 移除已花費的 UTXO
      for (const input of tx.inputs) {
        if (!input.coinbase) {
          this.spendUtxo(input.txid, input.vout);
        }
      }
      // 添加新的 UTXO
      tx.outputs.forEach((output, vout) => {
        this.addUtxo(tx.txid, vout, output, height);
      });
    }

    // 從 mempool 移除已確認的交易
    this.mempool = this.mempool.filter(item => !includedTxs.includes(item.tx.txid));

    // 更新統計
    this.stats.totalMined += reward;
    this.chain.push(block.serialize());

    // 難度調整
    if (this.chain.length % PARAMS.DIFFICULTY_ADJUSTMENT === 0) {
      this.adjustDifficulty();
    }

    this.save();

    return {
      success: true,
      block: block.serialize(),
      reward,
      height,
      txCount: block.transactions.length
    };
  }

  adjustDifficulty() {
    if (this.chain.length < PARAMS.DIFFICULTY_ADJUSTMENT) return;
    
    const lastBlock = this.chain[this.chain.length - 1];
    const firstBlock = this.chain[this.chain.length - PARAMS.DIFFICULTY_ADJUSTMENT];
    
    const actualTime = lastBlock.timestamp - firstBlock.timestamp;
    const expectedTime = PARAMS.DIFFICULTY_ADJUSTMENT * PARAMS.BLOCK_TIME_TARGET * 1000;
    
    if (actualTime < expectedTime / 4) {
      this.difficulty++;
    } else if (actualTime > expectedTime * 4) {
      this.difficulty = Math.max(1, this.difficulty - 1);
    }
  }

  // ========== 查詢 ==========

  getStats() {
    return {
      height: this.chain.length,
      difficulty: this.difficulty,
      reward: this.getBlockReward(),
      totalMined: this.stats.totalMined,
      remaining: PARAMS.MAX_SUPPLY - this.stats.totalMined,
      mempoolSize: this.mempool.length,
      utxoCount: this.utxoSet.size
    };
  }
}

module.exports = { Blockchain, Transaction, Block, PARAMS };
