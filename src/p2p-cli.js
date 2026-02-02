#!/usr/bin/env node
/**
 * ClawCoin P2P Node CLI
 */

const P2PNode = require('./p2p-node');

const [,, command, ...args] = process.argv;

const commands = {
  start: () => {
    const port = parseInt(args[0]) || 6677;
    const node = new P2PNode(port);
    node.start();

    // 處理指令
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (input) => {
      const [cmd, ...params] = input.trim().split(' ');
      
      switch (cmd) {
        case 'status':
          console.log(node.getStatus());
          break;
        case 'peers':
          console.log(`連接節點: ${node.peers.size}`);
          for (const [id] of node.peers) {
            console.log(`  - ${id.substring(0, 16)}...`);
          }
          break;
        case 'connect':
          const [host, port] = params[0].split(':');
          try {
            await node.connect(host, parseInt(port));
            console.log('✅ 連接成功');
          } catch (e) {
            console.log('❌ 連接失敗:', e.message);
          }
          break;
        case 'mine':
          const minerId = params[0] || 'cipher';
          const result = node.blockchain.mine(minerId, 'p2p-mining');
          if (result.success) {
            console.log(`⛏️ 挖礦成功! 區塊 #${result.blockIndex}`);
            // 廣播新區塊
            const block = node.blockchain.ledger.chain[node.blockchain.ledger.chain.length - 1];
            node.announceBlock(block);
          } else {
            console.log('❌', result.error);
          }
          break;
        case 'balance':
          const agentId = params[0] || 'cipher';
          console.log(`${agentId}: ${node.blockchain.getBalance(agentId)} CLAW`);
          break;
        case 'sync':
          node.broadcast('request_chain', {});
          console.log('📤 請求同步...');
          break;
        case 'help':
          console.log('命令:');
          console.log('  status           - 節點狀態');
          console.log('  peers            - 連接的節點');
          console.log('  connect host:port - 連接節點');
          console.log('  mine [agentId]   - 挖礦並廣播');
          console.log('  balance [agentId] - 查餘額');
          console.log('  sync             - 同步區塊鏈');
          break;
        default:
          if (cmd) console.log('未知命令，輸入 help 查看幫助');
      }
    });

    console.log('輸入 help 查看命令\n');
  },

  connect: async () => {
    const [hostPort, localPort] = args;
    if (!hostPort) {
      console.log('用法: p2p connect <host:port> [localPort]');
      return;
    }

    const node = new P2PNode(parseInt(localPort) || 6678);
    node.start();

    const [host, port] = hostPort.split(':');
    try {
      await node.connect(host, parseInt(port));
      console.log('✅ 連接成功，等待同步...');
    } catch (e) {
      console.log('❌ 連接失敗:', e.message);
    }
  },

  help: () => {
    console.log('🌐 ClawCoin P2P Network');
    console.log('');
    console.log('用法:');
    console.log('  node p2p-cli.js start [port]     啟動節點 (預設 6677)');
    console.log('  node p2p-cli.js connect host:port [localPort]  連接到節點');
    console.log('');
    console.log('範例:');
    console.log('  # 電腦 A: 啟動主節點');
    console.log('  node p2p-cli.js start 6677');
    console.log('');
    console.log('  # 電腦 B: 連接到 A');
    console.log('  node p2p-cli.js connect 192.168.1.100:6677');
  }
};

const handler = commands[command] || commands.help;
handler();
