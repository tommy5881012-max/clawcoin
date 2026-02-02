#!/usr/bin/env node
/**
 * ClawCoin Auto Miner - 自動挖礦機
 * 持續運行，不斷挖礦
 */

const ClawCoin = require('./blockchain');

const MINER_ID = process.argv[2] || 'cipher';
const INTERVAL_MS = parseInt(process.argv[3]) || 5000; // 預設 5 秒一塊

const coin = new ClawCoin();

// 檢查礦工是否存在
const agent = coin.getAgent(MINER_ID);
if (!agent) {
  console.log(`❌ 礦工 ${MINER_ID} 不存在，請先註冊`);
  console.log(`   node src/cli.js register ${MINER_ID} "Name"`);
  process.exit(1);
}

console.log('⛏️ ClawCoin Auto Miner');
console.log('═'.repeat(40));
console.log(`礦工: ${agent.name} (${MINER_ID})`);
console.log(`間隔: ${INTERVAL_MS / 1000} 秒/塊`);
console.log(`餘額: ${coin.getBalance(MINER_ID)} CLAW`);
console.log('');
console.log('開始挖礦... (Ctrl+C 停止)');
console.log('');

let totalMined = 0;
let blocksThisSession = 0;

async function mineLoop() {
  const startTime = Date.now();
  
  const result = coin.mine(MINER_ID, `auto-mining-${Date.now()}`);
  
  if (result.success) {
    blocksThisSession++;
    totalMined += result.reward;
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const time = new Date().toLocaleTimeString('zh-TW');
    
    console.log(`[${time}] ⛏️ 區塊 #${result.blockIndex} | +${result.reward} CLAW | 餘額: ${result.newBalance.toFixed(2)} | 難度: ${result.difficulty} | ${elapsed}s`);
    
    if (result.halved) {
      console.log('');
      console.log('🔔 ═══════════════════════════════════');
      console.log('🔔 區塊獎勵已減半!');
      console.log(`🔔 新獎勵: ${coin.getCurrentBlockReward()} CLAW`);
      console.log('🔔 ═══════════════════════════════════');
      console.log('');
    }
  } else {
    console.log(`❌ 挖礦失敗: ${result.error}`);
    if (result.error.includes('最大供應量')) {
      console.log('');
      console.log('🎉 所有 21,000,000 CLAW 已被挖完!');
      process.exit(0);
    }
  }
}

// 定時挖礦
setInterval(mineLoop, INTERVAL_MS);

// 立即開始第一次
mineLoop();

// 每 60 秒顯示統計
setInterval(() => {
  const stats = coin.getStats();
  console.log('');
  console.log(`📊 統計 | 本次: ${blocksThisSession} 塊, ${totalMined.toFixed(2)} CLAW | 總流通: ${stats.circulatingSupply.toFixed(2)} / 21,000,000 (${stats.percentMined}%)`);
  console.log('');
}, 60000);

// 優雅退出
process.on('SIGINT', () => {
  console.log('');
  console.log('═'.repeat(40));
  console.log('⛏️ 挖礦結束');
  console.log(`   本次挖了: ${blocksThisSession} 塊`);
  console.log(`   獲得: ${totalMined.toFixed(2)} CLAW`);
  console.log(`   最終餘額: ${coin.getBalance(MINER_ID)} CLAW`);
  console.log('═'.repeat(40));
  process.exit(0);
});
