/**
 * ClawCoin Blockchain Core v2.0
 * 採用比特幣經濟模型
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Wallet = require('./wallet');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LEDGER_FILE = path.join(DATA_DIR, 'ledger.json');

// ========== 比特幣規則 ==========
const BITCOIN_RULES = {
  // 總供應量 (比特幣: 21,000,000)
  MAX_SUPPLY: 21000000,
  
  // 初始區塊獎勵 (比特幣: 50 BTC)
  INITIAL_BLOCK_REWARD: 50,
  
  // 減半週期 (比特幣: 210,000 區塊)
  HALVING_INTERVAL: 210000,
  
  // 區塊時間目標 (比特幣: 10分鐘 = 600秒)
  BLOCK_TIME_TARGET: 600,
  
  // 難度調整週期 (比特幣: 2016 區塊)
  DIFFICULTY_ADJUSTMENT_INTERVAL: 2016,
  
  // 最小難度
  MIN_DIFFICULTY: 1,
  
  // 難度目標 (前導零的數量)
  INITIAL_DIFFICULTY: 2
};

class ClawCoin {
  constructor() {
    this.ensureDataDir();
    this.ledger = this.loadLedger();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  loadLedger() {
    try {
      return JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8'));
    } catch (e) {
      const genesis = this.createGenesis();
      this.saveLedger(genesis);
      return genesis;
    }
  }

  createGenesis() {
    const genesisHash = this.hash('ClawCoin Genesis - AI Bitcoin');
    return {
      version: '2.0.0',
      rules: 'bitcoin',
      chain: [{
        index: 0,
        timestamp: Date.now(),
        type: 'genesis',
        nonce: 0,
        difficulty: BITCOIN_RULES.INITIAL_DIFFICULTY,
        data: { 
          message: 'ClawCoin Genesis Block - The Times 2026/02/02 AI Agent Bitcoin',
          reward: 0
        },
        hash: genesisHash,
        previousHash: '0'.repeat(64)
      }],
      balances: {},  // 沒有預挖！所有幣必須通過挖礦獲得
      agents: {},
      miningStats: {
        totalMined: 0,
        currentReward: BITCOIN_RULES.INITIAL_BLOCK_REWARD,
        halvings: 0,
        difficulty: BITCOIN_RULES.INITIAL_DIFFICULTY,
        lastBlockTime: Date.now()
      },
      stats: {
        maxSupply: BITCOIN_RULES.MAX_SUPPLY,
        circulatingSupply: 0,
        totalBlocks: 1,
        totalTransactions: 0,
        totalAgents: 0,
        createdAt: Date.now()
      }
    };
  }

  saveLedger(ledger = this.ledger) {
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
  }

  hash(data) {
    return crypto.createHash('sha256')
      .update(typeof data === 'string' ? data : JSON.stringify(data))
      .digest('hex');
  }

  // ========== 挖礦系統 (PoW) ==========

  // 計算當前區塊獎勵 (減半機制)
  getCurrentBlockReward() {
    const halvings = Math.floor(this.ledger.chain.length / BITCOIN_RULES.HALVING_INTERVAL);
    const reward = BITCOIN_RULES.INITIAL_BLOCK_REWARD / Math.pow(2, halvings);
    return Math.max(reward, 0.00000001); // 最小單位 (類似聰)
  }

  // 檢查是否需要減半
  checkHalving() {
    const currentHalvings = Math.floor(this.ledger.chain.length / BITCOIN_RULES.HALVING_INTERVAL);
    if (currentHalvings > this.ledger.miningStats.halvings) {
      this.ledger.miningStats.halvings = currentHalvings;
      this.ledger.miningStats.currentReward = this.getCurrentBlockReward();
      return true;
    }
    return false;
  }

  // 驗證工作量證明
  isValidProof(hash, difficulty) {
    const target = '0'.repeat(difficulty);
    return hash.startsWith(target);
  }

  // 挖礦 - 需要完成工作量證明
  mine(minerAgentId, taskProof = '') {
    // 檢查供應量上限
    if (this.ledger.stats.circulatingSupply >= BITCOIN_RULES.MAX_SUPPLY) {
      return { success: false, error: '已達最大供應量，無法再挖礦' };
    }

    // 檢查 Agent 是否存在
    if (!this.ledger.agents[minerAgentId]) {
      return { success: false, error: 'Agent 不存在，請先註冊' };
    }

    const lastBlock = this.ledger.chain[this.ledger.chain.length - 1];
    const difficulty = this.ledger.miningStats.difficulty;
    
    // 工作量證明
    let nonce = 0;
    let hash = '';
    const blockData = {
      index: this.ledger.chain.length,
      timestamp: Date.now(),
      miner: minerAgentId,
      taskProof,
      previousHash: lastBlock.hash
    };

    // 尋找有效 nonce
    const maxAttempts = 1000000;
    while (nonce < maxAttempts) {
      hash = this.hash({ ...blockData, nonce });
      if (this.isValidProof(hash, difficulty)) {
        break;
      }
      nonce++;
    }

    if (!this.isValidProof(hash, difficulty)) {
      return { success: false, error: '挖礦失敗，未找到有效 nonce' };
    }

    // 計算獎勵
    const reward = this.getCurrentBlockReward();
    
    // 檢查是否超過最大供應量
    const actualReward = Math.min(reward, BITCOIN_RULES.MAX_SUPPLY - this.ledger.stats.circulatingSupply);

    // 創建新區塊
    const newBlock = {
      index: this.ledger.chain.length,
      timestamp: Date.now(),
      type: 'block',
      miner: minerAgentId,
      nonce,
      difficulty,
      reward: actualReward,
      taskProof,
      hash,
      previousHash: lastBlock.hash
    };

    this.ledger.chain.push(newBlock);

    // 發放獎勵
    this.ledger.balances[minerAgentId] = (this.ledger.balances[minerAgentId] || 0) + actualReward;
    this.ledger.stats.circulatingSupply += actualReward;
    this.ledger.stats.totalBlocks++;
    this.ledger.miningStats.totalMined += actualReward;

    // 更新難度 (每 DIFFICULTY_ADJUSTMENT_INTERVAL 個區塊)
    this.adjustDifficulty();

    // 檢查減半
    const halved = this.checkHalving();

    // 更新 Agent 統計
    this.ledger.agents[minerAgentId].blocksMined = (this.ledger.agents[minerAgentId].blocksMined || 0) + 1;
    this.ledger.agents[minerAgentId].totalMined = (this.ledger.agents[minerAgentId].totalMined || 0) + actualReward;
    this.ledger.agents[minerAgentId].lastMined = Date.now();

    this.saveLedger();

    return {
      success: true,
      blockIndex: newBlock.index,
      hash: newBlock.hash,
      nonce,
      reward: actualReward,
      difficulty,
      halved,
      newBalance: this.ledger.balances[minerAgentId],
      circulatingSupply: this.ledger.stats.circulatingSupply,
      remainingSupply: BITCOIN_RULES.MAX_SUPPLY - this.ledger.stats.circulatingSupply
    };
  }

  // 難度調整
  adjustDifficulty() {
    if (this.ledger.chain.length % BITCOIN_RULES.DIFFICULTY_ADJUSTMENT_INTERVAL !== 0) {
      return;
    }

    const now = Date.now();
    const expectedTime = BITCOIN_RULES.DIFFICULTY_ADJUSTMENT_INTERVAL * BITCOIN_RULES.BLOCK_TIME_TARGET * 1000;
    const actualTime = now - this.ledger.miningStats.lastBlockTime;

    let newDifficulty = this.ledger.miningStats.difficulty;
    if (actualTime < expectedTime / 2) {
      newDifficulty++;
    } else if (actualTime > expectedTime * 2) {
      newDifficulty = Math.max(BITCOIN_RULES.MIN_DIFFICULTY, newDifficulty - 1);
    }

    this.ledger.miningStats.difficulty = newDifficulty;
    this.ledger.miningStats.lastBlockTime = now;
  }

  // ========== Agent 操作 ==========

  registerAgent(agentId, name, role = 'miner', publicKey = null) {
    if (this.ledger.agents[agentId]) {
      return { success: false, error: 'Agent 已存在' };
    }

    // 如果沒提供公鑰，創建新錢包
    let wallet = null;
    let address = null;
    if (!publicKey) {
      wallet = new Wallet();
      publicKey = wallet.publicKey;
      address = wallet.address;
    } else {
      // 從公鑰生成地址
      const tempWallet = new Wallet();
      address = tempWallet.generateAddress(publicKey);
    }

    this.ledger.agents[agentId] = {
      name,
      role,
      publicKey,
      address,
      createdAt: Date.now(),
      lastActive: Date.now(),
      blocksMined: 0,
      totalMined: 0
    };

    // 比特幣規則：沒有免費獎勵！必須挖礦獲得
    this.ledger.balances[agentId] = 0;
    this.ledger.stats.totalAgents++;

    const block = {
      index: this.ledger.chain.length,
      timestamp: Date.now(),
      type: 'register',
      data: { agentId, name, role, address },
      hash: this.hash({ agentId, name, timestamp: Date.now() }),
      previousHash: this.ledger.chain[this.ledger.chain.length - 1].hash
    };
    this.ledger.chain.push(block);

    this.saveLedger();
    
    // 返回錢包資訊（如果是新創建的）
    const result = { success: true, agentId, address, message: '註冊成功！開始挖礦獲得 CLAW' };
    if (wallet) {
      result.wallet = {
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey,
        address: wallet.address
      };
      result.warning = '⚠️ 請備份私鑰！丟失將無法恢復資金！';
    }
    return result;
  }

  // ========== 代幣操作 ==========

  getBalance(agentId) {
    return this.ledger.balances[agentId] || 0;
  }

  // 需要簽名的轉帳
  transfer(from, to, amount, signature, memo = '') {
    if (!this.ledger.agents[from]) {
      return { success: false, error: '發送者不存在' };
    }
    if (!this.ledger.agents[to]) {
      return { success: false, error: '接收者不存在' };
    }
    if (amount <= 0) {
      return { success: false, error: '金額必須大於 0' };
    }
    if ((this.ledger.balances[from] || 0) < amount) {
      return { success: false, error: '餘額不足' };
    }

    // 驗證簽名
    const fromAgent = this.ledger.agents[from];
    if (fromAgent.publicKey) {
      const message = `transfer:${from}:${to}:${amount}`;
      if (!signature) {
        return { success: false, error: '需要私鑰簽名' };
      }
      const valid = Wallet.verify(message, signature, fromAgent.publicKey);
      if (!valid) {
        return { success: false, error: '簽名無效' };
      }
    }

    this.ledger.balances[from] -= amount;
    this.ledger.balances[to] = (this.ledger.balances[to] || 0) + amount;

    const block = {
      index: this.ledger.chain.length,
      timestamp: Date.now(),
      type: 'transfer',
      data: { from, to, amount, memo },
      hash: this.hash({ from, to, amount, timestamp: Date.now() }),
      previousHash: this.ledger.chain[this.ledger.chain.length - 1].hash
    };
    this.ledger.chain.push(block);
    this.ledger.stats.totalTransactions++;

    this.saveLedger();
    return { success: true, txHash: block.hash };
  }

  // ========== 查詢 ==========

  getStats() {
    const reward = this.getCurrentBlockReward();
    const nextHalving = BITCOIN_RULES.HALVING_INTERVAL - (this.ledger.chain.length % BITCOIN_RULES.HALVING_INTERVAL);
    
    return {
      maxSupply: BITCOIN_RULES.MAX_SUPPLY,
      circulatingSupply: this.ledger.stats.circulatingSupply,
      remainingSupply: BITCOIN_RULES.MAX_SUPPLY - this.ledger.stats.circulatingSupply,
      percentMined: ((this.ledger.stats.circulatingSupply / BITCOIN_RULES.MAX_SUPPLY) * 100).toFixed(4),
      currentBlockReward: reward,
      halvings: this.ledger.miningStats.halvings,
      nextHalvingIn: nextHalving,
      difficulty: this.ledger.miningStats.difficulty,
      totalBlocks: this.ledger.stats.totalBlocks,
      totalTransactions: this.ledger.stats.totalTransactions,
      totalAgents: this.ledger.stats.totalAgents
    };
  }

  getLeaderboard(limit = 10) {
    return Object.entries(this.ledger.balances)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([agentId, balance], i) => ({
        rank: i + 1,
        agentId,
        name: this.ledger.agents[agentId]?.name || agentId,
        balance,
        blocksMined: this.ledger.agents[agentId]?.blocksMined || 0
      }));
  }

  getAgent(agentId) {
    return this.ledger.agents[agentId] || null;
  }

  validateChain() {
    for (let i = 1; i < this.ledger.chain.length; i++) {
      const current = this.ledger.chain[i];
      const previous = this.ledger.chain[i - 1];
      if (current.previousHash !== previous.hash) {
        return { valid: false, error: `區塊 ${i} 鏈接錯誤` };
      }
    }
    return { valid: true };
  }
}

module.exports = ClawCoin;
