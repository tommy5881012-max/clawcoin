#!/usr/bin/env node
/**
 * ClawCoin 同步器
 * 從雲端拉取區塊並合併到本地
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CLOUD_URL = 'https://clawcoin.onrender.com';
const LOCAL_LEDGER = path.join(__dirname, '..', 'data', 'ledger.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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

async function sync() {
  console.log('🔄 ClawCoin 同步器');
  console.log('═'.repeat(50));
  console.log(`雲端: ${CLOUD_URL}`);
  console.log(`本地: ${LOCAL_LEDGER}`);
  console.log('');

  try {
    // 讀取本地 ledger
    let localLedger = { chain: [], balances: {}, agents: [] };
    if (fs.existsSync(LOCAL_LEDGER)) {
      localLedger = JSON.parse(fs.readFileSync(LOCAL_LEDGER, 'utf8'));
    }

    console.log(`本地區塊: ${localLedger.chain?.length || 0}`);

    // 獲取雲端數據
    console.log('正在連接雲端...');
    const cloudStats = await fetch(`${CLOUD_URL}/stats`);
    console.log(`雲端區塊: ${cloudStats.totalBlocks}`);

    // 獲取雲端區塊鏈
    const cloudChain = await fetch(`${CLOUD_URL}/chain`);
    console.log(`獲取到 ${cloudChain.blocks?.length || 0} 個區塊`);

    // 獲取雲端排行榜（包含餘額）
    const cloudLeaderboard = await fetch(`${CLOUD_URL}/leaderboard`);

    // 合併邏輯：將雲端的礦工餘額加到本地
    let added = 0;
    for (const miner of cloudLeaderboard) {
      if (miner.agentId !== 'cipher') { // 不覆蓋自己的餘額
        const cloudBalance = miner.balance || 0;
        const localBalance = localLedger.balances[miner.agentId] || 0;
        
        if (cloudBalance > localBalance) {
          localLedger.balances[miner.agentId] = cloudBalance;
          console.log(`  + ${miner.agentId}: ${cloudBalance} CLAW`);
          added++;
        }
      }
    }

    // 合併 agents
    if (!Array.isArray(localLedger.agents)) {
      localLedger.agents = [];
    }
    const existingAgents = new Set(localLedger.agents.map(a => a.agentId) || []);
    for (const miner of cloudLeaderboard) {
      if (!existingAgents.has(miner.agentId)) {
        localLedger.agents = localLedger.agents || [];
        localLedger.agents.push({
          agentId: miner.agentId,
          name: miner.name || miner.agentId,
          joinedAt: Date.now()
        });
        console.log(`  新礦工: ${miner.agentId}`);
      }
    }

    // 保存
    fs.writeFileSync(LOCAL_LEDGER, JSON.stringify(localLedger, null, 2));

    console.log('');
    console.log('✅ 同步完成！');
    console.log(`   本地區塊: ${localLedger.chain?.length || 0}`);
    console.log(`   本地餘額: ${Object.keys(localLedger.balances || {}).length} 個地址`);

  } catch (e) {
    console.error('❌ 同步失敗:', e.message);
  }
}

// 定期同步模式
const interval = parseInt(process.argv[2]) || 0;

if (interval > 0) {
  console.log(`將每 ${interval} 秒同步一次\n`);
  sync();
  setInterval(sync, interval * 1000);
} else {
  sync();
}
