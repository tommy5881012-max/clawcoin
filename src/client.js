#!/usr/bin/env node
/**
 * ClawCoin Client - 連接遠端節點
 * 讓任何人加入 ClawCoin 網路
 */

const https = require('https');
const http = require('http');

const DEFAULT_SERVER = process.env.CLAWCOIN_SERVER || 'http://localhost:3377';

class ClawCoinClient {
  constructor(serverUrl = DEFAULT_SERVER) {
    this.serverUrl = serverUrl;
  }

  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.serverUrl);
      const lib = url.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: { 'Content-Type': 'application/json' }
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({ raw: data }); }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // API 方法
  async getStats() {
    return this.request('GET', '/stats');
  }

  async getLeaderboard() {
    return this.request('GET', '/leaderboard');
  }

  async getBalance(agentId) {
    return this.request('GET', `/balance/${agentId}`);
  }

  async getAgent(agentId) {
    return this.request('GET', `/agent/${agentId}`);
  }

  async register(agentId, name, role = 'miner') {
    return this.request('POST', '/register', { agentId, name, role });
  }

  async mine(agentId, taskProof = '') {
    return this.request('POST', '/mine', { agentId, taskProof });
  }

  async transfer(from, to, amount, memo = '') {
    return this.request('POST', '/transfer', { from, to, amount, memo });
  }
}

// CLI
if (require.main === module) {
  const [,, serverUrl, command, ...args] = process.argv;
  
  if (!command) {
    console.log('🪙 ClawCoin Client');
    console.log('');
    console.log('用法: node client.js <server> <command> [args]');
    console.log('');
    console.log('命令:');
    console.log('  stats                    - 查看統計');
    console.log('  leaderboard              - 排行榜');
    console.log('  balance <agentId>        - 查餘額');
    console.log('  register <id> <name>     - 註冊');
    console.log('  mine <agentId> [proof]   - 挖礦');
    console.log('  transfer <from> <to> <amount> - 轉帳');
    console.log('');
    console.log('範例:');
    console.log('  node client.js http://localhost:3377 stats');
    console.log('  node client.js http://localhost:3377 register mybot "My Bot"');
    console.log('  node client.js http://localhost:3377 mine mybot');
    process.exit(0);
  }

  const client = new ClawCoinClient(serverUrl);

  async function main() {
    try {
      let result;
      switch (command) {
        case 'stats':
          result = await client.getStats();
          console.log('📊 ClawCoin 統計');
          console.log(JSON.stringify(result, null, 2));
          break;
        case 'leaderboard':
          result = await client.getLeaderboard();
          console.log('🏆 排行榜');
          result.forEach(e => {
            const medal = e.rank <= 3 ? ['🥇','🥈','🥉'][e.rank-1] : `#${e.rank}`;
            console.log(`${medal} ${e.name}: ${e.balance} CLAW`);
          });
          break;
        case 'balance':
          result = await client.getBalance(args[0]);
          console.log(`💰 ${args[0]}: ${result.balance} CLAW`);
          break;
        case 'register':
          result = await client.register(args[0], args[1], args[2]);
          console.log(result.success ? `✅ 註冊成功!` : `❌ ${result.error}`);
          break;
        case 'mine':
          console.log('⛏️ 挖礦中...');
          result = await client.mine(args[0], args.slice(1).join(' '));
          if (result.success) {
            console.log(`🎉 成功! 獲得 ${result.reward} CLAW`);
            console.log(`   區塊 #${result.blockIndex}`);
            console.log(`   餘額: ${result.newBalance} CLAW`);
          } else {
            console.log(`❌ ${result.error}`);
          }
          break;
        case 'transfer':
          result = await client.transfer(args[0], args[1], parseFloat(args[2]), args[3]);
          console.log(result.success ? `✅ 轉帳成功!` : `❌ ${result.error}`);
          break;
        default:
          console.log('未知命令:', command);
      }
    } catch (e) {
      console.log('❌ 連接失敗:', e.message);
    }
  }

  main();
}

module.exports = ClawCoinClient;
