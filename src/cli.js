#!/usr/bin/env node
/**
 * ClawCoin CLI v2.0 - Bitcoin Rules
 */

const ClawCoin = require('./blockchain');

const coin = new ClawCoin();
const [,, command, ...args] = process.argv;

function formatClaw(amount) {
  return `${amount.toLocaleString()} CLAW`;
}

const commands = {
  mine: () => {
    const agentId = args[0];
    const taskProof = args.slice(1).join(' ') || 'mining';
    
    if (!agentId) {
      console.log('用法: clawcoin mine <agentId> [taskProof]');
      return;
    }

    console.log('⛏️ 開始挖礦...');
    const start = Date.now();
    const result = coin.mine(agentId, taskProof);
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);

    if (result.success) {
      console.log('');
      console.log('🎉 挖礦成功!');
      console.log('═'.repeat(40));
      console.log(`區塊高度:   #${result.blockIndex}`);
      console.log(`區塊哈希:   ${result.hash.substring(0, 16)}...`);
      console.log(`Nonce:      ${result.nonce}`);
      console.log(`難度:       ${result.difficulty}`);
      console.log(`獎勵:       ${formatClaw(result.reward)}`);
      console.log(`新餘額:     ${formatClaw(result.newBalance)}`);
      console.log(`耗時:       ${elapsed}s`);
      console.log('');
      console.log(`📊 流通量: ${formatClaw(result.circulatingSupply)} / 21,000,000`);
      console.log(`📊 剩餘:   ${formatClaw(result.remainingSupply)}`);
      if (result.halved) {
        console.log('');
        console.log('🔔 區塊獎勵已減半!');
      }
    } else {
      console.log(`❌ 挖礦失敗: ${result.error}`);
    }
  },

  register: () => {
    const [agentId, name, role] = args;
    if (!agentId || !name) {
      console.log('用法: clawcoin register <agentId> <name> [role]');
      return;
    }
    const result = coin.registerAgent(agentId, name, role || 'miner');
    if (result.success) {
      console.log(`✅ ${result.message}`);
      console.log(`   Agent ID: ${agentId}`);
      console.log(`   初始餘額: 0 CLAW (需挖礦獲得)`);
    } else {
      console.log(`❌ ${result.error}`);
    }
  },

  balance: () => {
    const agentId = args[0];
    if (!agentId) {
      console.log('用法: clawcoin balance <agentId>');
      return;
    }
    const balance = coin.getBalance(agentId);
    const agent = coin.getAgent(agentId);
    if (agent) {
      console.log(`🤖 ${agent.name} (${agentId})`);
      console.log(`💰 餘額: ${formatClaw(balance)}`);
      console.log(`⛏️ 已挖區塊: ${agent.blocksMined || 0}`);
      console.log(`📈 累計挖礦: ${formatClaw(agent.totalMined || 0)}`);
    } else {
      console.log(`Agent ${agentId} 不存在`);
    }
  },

  transfer: () => {
    const [from, to, amount, ...memoParts] = args;
    if (!from || !to || !amount) {
      console.log('用法: clawcoin transfer <from> <to> <amount> [memo]');
      return;
    }
    const result = coin.transfer(from, to, parseFloat(amount), memoParts.join(' '));
    if (result.success) {
      console.log(`✅ 轉帳成功!`);
      console.log(`   ${from} → ${to}: ${formatClaw(parseFloat(amount))}`);
      console.log(`   TX: ${result.txHash.substring(0, 16)}...`);
    } else {
      console.log(`❌ ${result.error}`);
    }
  },

  stats: () => {
    const stats = coin.getStats();
    console.log('📊 ClawCoin 統計 (Bitcoin Rules)');
    console.log('═'.repeat(45));
    console.log(`最大供應量:     ${formatClaw(stats.maxSupply)}`);
    console.log(`流通供應量:     ${formatClaw(stats.circulatingSupply)}`);
    console.log(`剩餘可挖:       ${formatClaw(stats.remainingSupply)}`);
    console.log(`已挖比例:       ${stats.percentMined}%`);
    console.log('─'.repeat(45));
    console.log(`當前區塊獎勵:   ${formatClaw(stats.currentBlockReward)}`);
    console.log(`減半次數:       ${stats.halvings}`);
    console.log(`下次減半:       ${stats.nextHalvingIn} 區塊後`);
    console.log(`當前難度:       ${stats.difficulty}`);
    console.log('─'.repeat(45));
    console.log(`總區塊數:       ${stats.totalBlocks}`);
    console.log(`總交易數:       ${stats.totalTransactions}`);
    console.log(`Agent 數:       ${stats.totalAgents}`);
  },

  leaderboard: () => {
    const board = coin.getLeaderboard(10);
    console.log('🏆 ClawCoin 礦工排行榜');
    console.log('═'.repeat(50));
    if (board.length === 0) {
      console.log('暫無礦工，開始挖礦吧！');
      return;
    }
    board.forEach(e => {
      const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`;
      console.log(`${medal} ${e.name}: ${formatClaw(e.balance)} (${e.blocksMined} blocks)`);
    });
  },

  validate: () => {
    const result = coin.validateChain();
    console.log(result.valid ? '✅ 區塊鏈驗證通過!' : `❌ ${result.error}`);
  },

  help: () => {
    console.log('🪙 ClawCoin - AI Agent Bitcoin');
    console.log('');
    console.log('比特幣規則:');
    console.log('  • 總供應量: 21,000,000 CLAW');
    console.log('  • 初始獎勵: 50 CLAW/區塊');
    console.log('  • 每 210,000 區塊減半');
    console.log('  • 沒有預挖，所有幣必須挖礦獲得');
    console.log('');
    console.log('命令:');
    console.log('  register <id> <name>           註冊礦工');
    console.log('  mine <agentId> [proof]         挖礦');
    console.log('  balance <agentId>              查詢餘額');
    console.log('  transfer <from> <to> <amount>  轉帳');
    console.log('  stats                          統計');
    console.log('  leaderboard                    排行榜');
    console.log('  validate                       驗證區塊鏈');
  }
};

const handler = commands[command] || commands.help;
handler();
