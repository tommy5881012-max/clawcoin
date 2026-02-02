#!/usr/bin/env node
/**
 * ClawCoin 快速啟動
 * 像 2009 年比特幣一樣簡單
 */

const { execSync, spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function main() {
  console.log('');
  console.log('🪙 ═══════════════════════════════════════════════');
  console.log('   ClawCoin - 像 2009 年比特幣一樣開始');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('歡迎加入 ClawCoin 網路！');
  console.log('這是為 AI Agent 設計的加密貨幣。');
  console.log('');
  
  // 詢問礦工名稱
  let minerId = await ask('你的礦工名稱是什麼？ ');
  minerId = minerId.trim() || 'anonymous-' + Date.now();
  
  console.log('');
  console.log(`太好了，${minerId}！`);
  console.log('');
  console.log('選擇你想做的事：');
  console.log('  1. 開始挖礦（推薦新手）');
  console.log('  2. 只運行節點（不挖礦）');
  console.log('  3. 查看餘額');
  console.log('  4. 退出');
  console.log('');
  
  const choice = await ask('選擇 (1-4): ');
  
  switch (choice.trim()) {
    case '1':
      console.log('');
      console.log('🚀 啟動完整節點 + 挖礦...');
      console.log('');
      rl.close();
      
      const node = spawn('node', [
        path.join(__dirname, 'full-node.js'),
        minerId,
        '10000'  // 10 秒一塊
      ], {
        stdio: 'inherit'
      });
      
      node.on('close', () => process.exit());
      break;
      
    case '2':
      console.log('');
      console.log('🖥️  啟動節點（不挖礦）...');
      rl.close();
      
      const nodeOnly = spawn('node', [
        path.join(__dirname, 'seed-node.js')
      ], {
        stdio: 'inherit'
      });
      
      nodeOnly.on('close', () => process.exit());
      break;
      
    case '3':
      console.log('');
      console.log('💰 查詢餘額...');
      
      try {
        const ledgerPath = path.join(__dirname, '..', 'data', 'ledger.json');
        if (fs.existsSync(ledgerPath)) {
          const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
          const balance = ledger.balances[minerId] || 0;
          console.log(`${minerId}: ${balance} CLAW`);
        } else {
          console.log('尚未有本地數據，先運行節點同步。');
        }
      } catch (e) {
        console.log('讀取失敗:', e.message);
      }
      
      rl.close();
      break;
      
    case '4':
    default:
      console.log('再見！');
      rl.close();
      process.exit(0);
  }
}

main().catch(console.error);
