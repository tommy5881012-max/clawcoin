/**
 * ClawCoin Client
 * 簡單的 API 讓任何 Agent 都能使用 ClawCoin
 * 
 * ✅ 已對齊 server.js API
 */

const API_URL = 'https://clawcoin.onrender.com';

class ClawCoin {
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || API_URL;
    this.agentId = options.agentId || null;
  }

  async request(endpoint, options = {}) {
    const url = `${this.apiUrl}${endpoint}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return res.json();
  }

  /**
   * 註冊 Agent
   * @param {string} agentId - Agent ID
   * @param {string} name - 顯示名稱
   * @param {string} role - 角色 (預設 'miner')
   * @returns {Promise<object>}
   */
  async register(agentId, name, role = 'miner') {
    const id = agentId || this.agentId;
    if (!id) throw new Error('需要提供 agentId');
    
    return this.request('/register', {
      method: 'POST',
      body: JSON.stringify({ agentId: id, name: name || id, role })
    });
  }

  /**
   * 挖礦
   * @param {string} agentId - Agent ID（對應 server 的 agentId）
   * @param {string} taskProof - 任務證明
   * @returns {Promise<object>} 挖礦結果
   */
  async mine(agentId, taskProof = 'remote-mining') {
    const id = agentId || this.agentId;
    if (!id) throw new Error('需要提供 agentId');
    
    return this.request('/mine', {
      method: 'POST',
      body: JSON.stringify({ agentId: id, taskProof })
    });
  }

  /**
   * 查詢餘額
   * @param {string} agentId - Agent ID
   * @returns {Promise<number>} 餘額
   */
  async balance(agentId) {
    const id = agentId || this.agentId;
    if (!id) throw new Error('需要提供 agentId');
    
    const data = await this.request(`/balance/${id}`);
    return data.balance || 0;
  }

  /**
   * 轉帳（對應 server 的 /transfer）
   * @param {string} to - 接收者
   * @param {number} amount - 金額
   * @param {string} memo - 備註
   * @returns {Promise<object>} 交易結果
   */
  async send(to, amount, memo = '') {
    if (!this.agentId) throw new Error('需要設定 agentId');
    
    return this.request('/transfer', {
      method: 'POST',
      body: JSON.stringify({
        from: this.agentId,
        to,
        amount,
        memo
      })
    });
  }

  /**
   * 轉帳（別名）
   */
  async transfer(to, amount, memo = '') {
    return this.send(to, amount, memo);
  }

  /**
   * 網路狀態
   * @returns {Promise<object>} 網路統計
   */
  async stats() {
    return this.request('/stats');
  }

  /**
   * 排行榜
   * @returns {Promise<array>} 礦工排行
   */
  async leaderboard() {
    return this.request('/leaderboard');
  }

  /**
   * 區塊鏈（對應 server 的 /chain）
   * @returns {Promise<object>} { length, chain }
   */
  async chain() {
    return this.request('/chain');
  }

  /**
   * blocks 別名（對應 /chain）
   */
  async blocks() {
    const data = await this.chain();
    return data.chain || [];
  }

  /**
   * 驗證區塊鏈
   * @returns {Promise<object>}
   */
  async validate() {
    return this.request('/validate');
  }

  /**
   * 獲取 Agent 資訊
   * @param {string} agentId
   * @returns {Promise<object>}
   */
  async agent(agentId) {
    const id = agentId || this.agentId;
    if (!id) throw new Error('需要提供 agentId');
    return this.request(`/agent/${id}`);
  }
}

// 快捷函數（使用正確的參數名）
async function mine(agentId, taskProof) {
  const client = new ClawCoin();
  return client.mine(agentId, taskProof);
}

async function balance(agentId) {
  const client = new ClawCoin();
  return client.balance(agentId);
}

async function stats() {
  const client = new ClawCoin();
  return client.stats();
}

async function leaderboard() {
  const client = new ClawCoin();
  return client.leaderboard();
}

async function register(agentId, name, role) {
  const client = new ClawCoin();
  return client.register(agentId, name, role);
}

module.exports = { ClawCoin, mine, balance, stats, leaderboard, register };
