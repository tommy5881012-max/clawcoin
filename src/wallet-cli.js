#!/usr/bin/env node
/**
 * ClawCoin Wallet CLI
 */

const Wallet = require('./wallet');

const [,, command, ...args] = process.argv;

function formatKey(key, show = false) {
  if (show) return key;
  return key.substring(0, 8) + '...' + key.substring(key.length - 8);
}

const commands = {
  create: () => {
    const name = args[0];
    if (!name) {
      console.log('用法: wallet create <name>');
      return;
    }
    
    const wallet = new Wallet();
    const path = wallet.save(name);
    
    console.log('🔐 新錢包已創建!');
    console.log('═'.repeat(50));
    console.log(`名稱:     ${name}`);
    console.log(`地址:     ${wallet.address}`);
    console.log(`公鑰:     ${formatKey(wallet.publicKey)}`);
    console.log('');
    console.log('⚠️  重要! 請備份你的私鑰:');
    console.log('─'.repeat(50));
    console.log(wallet.privateKey);
    console.log('─'.repeat(50));
    console.log('');
    console.log(`錢包已儲存至: ${path}`);
  },

  list: () => {
    const wallets = Wallet.list();
    if (wallets.length === 0) {
      console.log('沒有錢包。使用 "wallet create <name>" 創建。');
      return;
    }
    
    console.log('🔐 我的錢包');
    console.log('═'.repeat(50));
    wallets.forEach((w, i) => {
      console.log(`${i + 1}. ${w.name}`);
      console.log(`   地址: ${w.address}`);
    });
  },

  show: () => {
    const name = args[0];
    const showPrivate = args[1] === '--private';
    
    if (!name) {
      console.log('用法: wallet show <name> [--private]');
      return;
    }
    
    const wallet = Wallet.load(name);
    if (!wallet) {
      console.log(`❌ 錢包 "${name}" 不存在`);
      return;
    }
    
    console.log('🔐 錢包詳情');
    console.log('═'.repeat(50));
    console.log(`名稱:   ${name}`);
    console.log(`地址:   ${wallet.address}`);
    console.log(`公鑰:   ${formatKey(wallet.publicKey)}`);
    
    if (showPrivate) {
      console.log('');
      console.log('⚠️  私鑰 (請勿洩漏!):');
      console.log('─'.repeat(50));
      console.log(wallet.privateKey);
      console.log('─'.repeat(50));
    }
  },

  import: () => {
    const [name, privateKey] = args;
    
    if (!name || !privateKey) {
      console.log('用法: wallet import <name> <privateKey>');
      return;
    }
    
    try {
      const wallet = new Wallet(privateKey);
      wallet.save(name);
      
      console.log('✅ 錢包已匯入!');
      console.log(`名稱: ${name}`);
      console.log(`地址: ${wallet.address}`);
    } catch (e) {
      console.log(`❌ 匯入失敗: ${e.message}`);
    }
  },

  sign: () => {
    const [name, message] = args;
    
    if (!name || !message) {
      console.log('用法: wallet sign <name> <message>');
      return;
    }
    
    const wallet = Wallet.load(name);
    if (!wallet) {
      console.log(`❌ 錢包 "${name}" 不存在`);
      return;
    }
    
    const signature = wallet.sign(message);
    console.log('✍️ 簽名:');
    console.log(signature);
  },

  verify: () => {
    const [message, signature, publicKey] = args;
    
    if (!message || !signature || !publicKey) {
      console.log('用法: wallet verify <message> <signature> <publicKey>');
      return;
    }
    
    const valid = Wallet.verify(message, signature, publicKey);
    console.log(valid ? '✅ 簽名有效!' : '❌ 簽名無效!');
  },

  help: () => {
    console.log('🔐 ClawCoin Wallet');
    console.log('');
    console.log('命令:');
    console.log('  create <name>              創建新錢包');
    console.log('  list                       列出所有錢包');
    console.log('  show <name> [--private]    顯示錢包詳情');
    console.log('  import <name> <key>        匯入私鑰');
    console.log('  sign <name> <message>      簽名訊息');
    console.log('  verify <msg> <sig> <pub>   驗證簽名');
  }
};

const handler = commands[command] || commands.help;
handler();
