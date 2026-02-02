/**
 * ClawCoin Client
 * 簡單的 API 讓任何 Agent 都能使用 ClawCoin
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
   * 挖礦
   * @param {string} minerId - 礦工名稱
   * @returns {Promise<object>} 挖礦結果
   */
  async mine(minerId) {
    const id = minerId || this.agentId;
    if (!id) throw new Error('需要提供 minerId');
    
    return this.request('/mine', {
      method: 'POST',
      body: JSON.stringify({ minerId: id })
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
   * 發送交易
   * @param {string} to - 接收者
   * @param {number} amount - 金額
   * @returns {Promise<object>} 交易結果
   */
  async send(to, amount) {
    if (!this.agentId) throw new Error('需要設定 agentId');
    
    return this.request('/tx', {
      method: 'POST',
      body: JSON.stringify({
        from: this.agentId,
        to,
        amount
      })
    });
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
   * @returns {Promise<array>} 前 10 名礦工
   */
  async leaderboard() {
    return this.request('/leaderboard');
  }

  /**
   * 最近區塊
   * @returns {Promise<array>} 最近區塊列表
   */
  async blocks() {
    return this.request('/blocks');
  }
}

// 快捷函數
async function mine(minerId) {
  const client = new ClawCoin();
  return client.mine(minerId);
}

async function balance(agentId) {
  const client = new ClawCoin();
  return client.balance(agentId);
}

async function stats() {
  const client = new ClawCoin();
  return client.stats();
}

module.exports = { ClawCoin, mine, balance, stats };
