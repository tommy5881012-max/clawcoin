#!/usr/bin/env node
/**
 * ClawCoin CLI - 統一命令入口
 */

const path = require('path');

const commands = {
  // 節點
  start: () => require('./p2p-cli'),
  node: () => require('./p2p-cli'),
  connect: () => require('./p2p-cli'),
  
  // 錢包
  wallet: () => require('./wallet-cli'),
  balance: () => {
    const ClawCoin = require('./blockchain');
    const cc = new ClawCoin();
    const address = process.argv[3];
    console.log(`${address}: ${cc.getBalance(address)} CLAW`);
  },
  
  // 挖礦
  mine: () => {
    const args = process.argv.slice(3);
    const miner = args[0] || 'default';
    const auto = args.includes('--auto');
    
    if (auto) {
      require('./auto-miner');
    } else {
      const ClawCoin = require('./blockchain');
      const cc = new ClawCoin();
      const result = cc.mine(miner, 'cli-mining');
      if (result.success) {
        console.log(`⛏️ 挖到區塊 #${result.blockIndex}! 獲得 ${result.reward} CLAW`);
      } else {
        console.log('❌', result.error);
      }
    }
  },
  
  // 轉帳
  send: () => {
    const [from, to, amount] = process.argv.slice(3);
    const ClawCoin = require('./blockchain');
    const cc = new ClawCoin();
    const result = cc.transfer(from, to, parseFloat(amount));
    if (result.success) {
      console.log(`✅ 轉帳成功: ${from} → ${to}: ${amount} CLAW`);
    } else {
      console.log('❌', result.error);
    }
  },
  
  // 伺服器
  server: () => require('./server'),
  
  // 閃電網路
  lightning: () => {
    const { LightningNode } = require('./lightning');
    const Wallet = require('./wallet');
    const wallet = new Wallet();
    const node = new LightningNode(wallet);
    
    const subCmd = process.argv[3];
    switch (subCmd) {
      case 'invoice':
        const amount = parseFloat(process.argv[4] || 1);
        const desc = process.argv[5] || '';
        const { invoiceStr } = node.createInvoice(amount, desc);
        console.log('⚡ 發票:', invoiceStr);
        break;
      case 'status':
        console.log(node.getStatus());
        break;
      default:
        console.log('用法: clawcoin lightning <invoice|pay|open|status>');
    }
  },
  
  // 統計
  stats: () => {
    const ClawCoin = require('./blockchain');
    const cc = new ClawCoin();
    console.log(cc.getStats());
  },
  
  // 幫助
  help: () => {
    console.log(`
🪙 ClawCoin CLI

用法: clawcoin <命令> [選項]

節點命令:
  start               啟動節點
  connect <host:port> 連接到節點
  
錢包命令:
  wallet create <名稱>     創建錢包
  wallet show <名稱>       查看錢包
  balance <地址>           查詢餘額
  
挖礦命令:
  mine <礦工ID>            挖一個區塊
  mine <礦工ID> --auto     自動挖礦
  
交易命令:
  send <從> <到> <數量>    轉帳
  
閃電網路:
  lightning invoice <金額> 創建發票
  lightning status         節點狀態
  
其他:
  server                   啟動 API 伺服器
  stats                    網路統計
  help                     顯示幫助
`);
  }
};

const cmd = process.argv[2] || 'help';
const handler = commands[cmd] || commands.help;
handler();
