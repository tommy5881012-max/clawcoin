/**
 * ClawCoin Lightning Network
 * Layer 2 閃電網路實現
 */

const crypto = require('crypto');
const EventEmitter = require('events');

// ========== 支付通道 ==========
class PaymentChannel extends EventEmitter {
  constructor(nodeA, nodeB, capacity) {
    super();
    this.channelId = crypto.randomBytes(32).toString('hex');
    this.nodeA = nodeA; // {address, publicKey}
    this.nodeB = nodeB;
    this.capacity = capacity; // 通道容量
    this.balanceA = capacity; // A 的餘額
    this.balanceB = 0; // B 的餘額
    this.state = 'pending'; // pending, open, closing, closed
    this.commitmentNumber = 0;
    this.htlcs = []; // 進行中的 HTLC
    this.fundingTx = null;
    this.commitments = [];
  }

  // 開啟通道（資金交易）
  open(fundingTx) {
    this.fundingTx = fundingTx;
    this.state = 'open';
    this.emit('open', { channelId: this.channelId, capacity: this.capacity });
    return this;
  }

  // 更新通道狀態
  updateBalance(amountToB) {
    if (amountToB > this.balanceA) {
      return { success: false, error: '餘額不足' };
    }

    this.balanceA -= amountToB;
    this.balanceB += amountToB;
    this.commitmentNumber++;

    // 創建新的承諾交易
    const commitment = this.createCommitment();
    this.commitments.push(commitment);

    this.emit('update', {
      channelId: this.channelId,
      balanceA: this.balanceA,
      balanceB: this.balanceB,
      commitment: this.commitmentNumber
    });

    return { success: true, commitment };
  }

  // 創建承諾交易
  createCommitment() {
    return {
      number: this.commitmentNumber,
      timestamp: Date.now(),
      outputs: [
        { address: this.nodeA.address, amount: this.balanceA },
        { address: this.nodeB.address, amount: this.balanceB }
      ],
      htlcs: [...this.htlcs],
      signature: null // 需要雙方簽名
    };
  }

  // 添加 HTLC
  addHTLC(amount, paymentHash, expiry) {
    if (amount > this.balanceA) {
      return { success: false, error: '餘額不足' };
    }

    const htlc = {
      id: crypto.randomBytes(8).toString('hex'),
      amount,
      paymentHash,
      expiry,
      state: 'pending'
    };

    this.htlcs.push(htlc);
    this.balanceA -= amount; // 暫時鎖定

    return { success: true, htlc };
  }

  // 用原像結算 HTLC
  settleHTLC(htlcId, preimage) {
    const htlc = this.htlcs.find(h => h.id === htlcId);
    if (!htlc) {
      return { success: false, error: 'HTLC 不存在' };
    }

    const hash = crypto.createHash('sha256').update(preimage).digest('hex');
    if (hash !== htlc.paymentHash) {
      return { success: false, error: '原像不匹配' };
    }

    htlc.state = 'settled';
    this.balanceB += htlc.amount;
    this.htlcs = this.htlcs.filter(h => h.id !== htlcId);

    return { success: true };
  }

  // 超時失敗 HTLC
  failHTLC(htlcId) {
    const htlc = this.htlcs.find(h => h.id === htlcId);
    if (!htlc) {
      return { success: false, error: 'HTLC 不存在' };
    }

    htlc.state = 'failed';
    this.balanceA += htlc.amount; // 退回
    this.htlcs = this.htlcs.filter(h => h.id !== htlcId);

    return { success: true };
  }

  // 協作關閉
  cooperativeClose() {
    this.state = 'closing';
    
    const closingTx = {
      type: 'closing',
      channelId: this.channelId,
      outputs: [
        { address: this.nodeA.address, amount: this.balanceA },
        { address: this.nodeB.address, amount: this.balanceB }
      ],
      timestamp: Date.now()
    };

    this.state = 'closed';
    this.emit('close', closingTx);
    
    return closingTx;
  }

  // 強制關閉（用最新承諾交易）
  forceClose() {
    this.state = 'closing';
    const latestCommitment = this.commitments[this.commitments.length - 1];
    this.emit('force_close', latestCommitment);
    return latestCommitment;
  }

  getInfo() {
    return {
      channelId: this.channelId,
      nodeA: this.nodeA.address,
      nodeB: this.nodeB.address,
      capacity: this.capacity,
      balanceA: this.balanceA,
      balanceB: this.balanceB,
      state: this.state,
      htlcs: this.htlcs.length,
      commitments: this.commitmentNumber
    };
  }
}

// ========== 閃電網路節點 ==========
class LightningNode extends EventEmitter {
  constructor(wallet) {
    super();
    this.nodeId = crypto.randomBytes(33).toString('hex');
    this.wallet = wallet;
    this.channels = new Map(); // channelId -> PaymentChannel
    this.peers = new Map(); // nodeId -> connection
    this.routingTable = new Map(); // destination -> [hops]
    this.invoices = new Map(); // paymentHash -> invoice
    this.payments = new Map(); // paymentHash -> payment state
  }

  // 連接到其他節點
  connect(peerNodeId, connection) {
    this.peers.set(peerNodeId, connection);
    this.emit('peer_connected', peerNodeId);
  }

  // 開啟通道
  async openChannel(peerNodeId, amount) {
    const peer = this.peers.get(peerNodeId);
    if (!peer) {
      return { success: false, error: '節點未連接' };
    }

    // 創建資金交易
    const fundingTx = {
      type: 'funding',
      amount,
      from: this.wallet.address,
      multisig: true, // 2-of-2 多簽
      timestamp: Date.now()
    };

    const channel = new PaymentChannel(
      { address: this.wallet.address, publicKey: this.wallet.publicKey },
      { address: peer.address, publicKey: peer.publicKey },
      amount
    );

    channel.open(fundingTx);
    this.channels.set(channel.channelId, channel);

    // 更新路由表
    this.updateRoutingTable();

    return { success: true, channelId: channel.channelId };
  }

  // 創建發票
  createInvoice(amount, description = '') {
    const preimage = crypto.randomBytes(32);
    const paymentHash = crypto.createHash('sha256').update(preimage).digest('hex');

    const invoice = {
      paymentHash,
      preimage: preimage.toString('hex'),
      amount,
      description,
      nodeId: this.nodeId,
      createdAt: Date.now(),
      expiry: Date.now() + 3600000, // 1 小時
      paid: false
    };

    this.invoices.set(paymentHash, invoice);

    // 生成 Lightning Invoice 字串 (簡化版)
    const invoiceStr = `lnclaw${amount}${paymentHash.substring(0, 16)}`;

    return { invoice, invoiceStr };
  }

  // 支付發票
  async payInvoice(invoiceStr, amount, paymentHash, destNodeId) {
    // 找路由
    const route = this.findRoute(destNodeId, amount);
    if (!route) {
      return { success: false, error: '找不到路由' };
    }

    // 創建洋蔥路由
    const onionPacket = this.createOnionPacket(route, paymentHash, amount);

    // 發送支付
    return this.sendPayment(route, onionPacket);
  }

  // 找最短路由
  findRoute(destNodeId, amount) {
    // Dijkstra 簡化版
    const routes = this.routingTable.get(destNodeId);
    if (!routes || routes.length === 0) {
      // 嘗試直連
      for (const [, channel] of this.channels) {
        if (channel.nodeB.address === destNodeId && channel.balanceA >= amount) {
          return [{ channelId: channel.channelId, nodeId: destNodeId, fee: 0 }];
        }
      }
      return null;
    }

    // 選擇手續費最低的路由
    return routes.sort((a, b) => a.totalFee - b.totalFee)[0].hops;
  }

  // 創建洋蔥路由包
  createOnionPacket(route, paymentHash, amount) {
    // 簡化版洋蔥路由
    return {
      route: route.map((hop, i) => ({
        ...hop,
        amount: amount + route.slice(i).reduce((sum, h) => sum + h.fee, 0)
      })),
      paymentHash,
      finalAmount: amount
    };
  }

  // 發送支付
  async sendPayment(route, onionPacket) {
    const firstHop = route[0];
    const channel = this.channels.get(firstHop.channelId);

    if (!channel) {
      return { success: false, error: '通道不存在' };
    }

    // 添加 HTLC
    const htlcResult = channel.addHTLC(
      onionPacket.route[0].amount,
      onionPacket.paymentHash,
      Date.now() + 3600000
    );

    if (!htlcResult.success) {
      return htlcResult;
    }

    // 等待原像（實際需要網路傳輸）
    this.payments.set(onionPacket.paymentHash, {
      state: 'pending',
      route,
      htlcId: htlcResult.htlc.id,
      channelId: channel.channelId
    });

    return {
      success: true,
      paymentHash: onionPacket.paymentHash,
      state: 'pending'
    };
  }

  // 收到原像，結算支付
  settlePayment(paymentHash, preimage) {
    const payment = this.payments.get(paymentHash);
    if (!payment) {
      return { success: false, error: '支付不存在' };
    }

    const channel = this.channels.get(payment.channelId);
    const result = channel.settleHTLC(payment.htlcId, preimage);

    if (result.success) {
      payment.state = 'settled';
      this.emit('payment_settled', { paymentHash, preimage });
    }

    return result;
  }

  // 更新路由表
  updateRoutingTable() {
    // 廣播通道資訊給網路
    for (const [, channel] of this.channels) {
      if (channel.state === 'open') {
        this.emit('channel_update', channel.getInfo());
      }
    }
  }

  // 處理收到的支付
  handleIncomingPayment(paymentHash, amount, htlcId, fromChannelId) {
    const invoice = this.invoices.get(paymentHash);
    
    if (!invoice) {
      // 路由節點：轉發支付
      return this.forwardPayment(paymentHash, amount, htlcId, fromChannelId);
    }

    if (amount < invoice.amount) {
      return { success: false, error: '金額不足' };
    }

    // 收款成功，返回原像
    invoice.paid = true;
    
    const channel = this.channels.get(fromChannelId);
    channel.settleHTLC(htlcId, invoice.preimage);

    this.emit('payment_received', { paymentHash, amount, preimage: invoice.preimage });

    return { success: true, preimage: invoice.preimage };
  }

  // 轉發支付（路由節點）
  forwardPayment(paymentHash, amount, htlcId, fromChannelId) {
    // 查找下一跳
    // 簡化版：需要完整的洋蔥路由解析
    return { success: false, error: '無法轉發' };
  }

  // 獲取節點狀態
  getStatus() {
    let totalCapacity = 0;
    let totalBalance = 0;

    for (const [, channel] of this.channels) {
      totalCapacity += channel.capacity;
      totalBalance += channel.balanceA;
    }

    return {
      nodeId: this.nodeId,
      channels: this.channels.size,
      peers: this.peers.size,
      totalCapacity,
      totalBalance,
      pendingPayments: this.payments.size,
      invoices: this.invoices.size
    };
  }

  // 列出通道
  listChannels() {
    return Array.from(this.channels.values()).map(c => c.getInfo());
  }
}

// ========== 閃電網路 ==========
class LightningNetwork {
  constructor() {
    this.nodes = new Map(); // nodeId -> LightningNode
    this.graph = new Map(); // 網路拓撲
  }

  // 註冊節點
  registerNode(node) {
    this.nodes.set(node.nodeId, node);
    this.graph.set(node.nodeId, []);

    // 監聽通道更新
    node.on('channel_update', (info) => {
      this.updateGraph(node.nodeId, info);
    });
  }

  // 更新網路圖
  updateGraph(fromNodeId, channelInfo) {
    const edges = this.graph.get(fromNodeId) || [];
    
    const existingEdge = edges.find(e => e.channelId === channelInfo.channelId);
    if (existingEdge) {
      Object.assign(existingEdge, channelInfo);
    } else {
      edges.push(channelInfo);
      this.graph.set(fromNodeId, edges);
    }
  }

  // 獲取網路統計
  getStats() {
    let totalChannels = 0;
    let totalCapacity = 0;

    for (const [, edges] of this.graph) {
      totalChannels += edges.length;
      totalCapacity += edges.reduce((sum, e) => sum + e.capacity, 0);
    }

    return {
      nodes: this.nodes.size,
      channels: totalChannels / 2, // 每個通道算兩次
      totalCapacity
    };
  }
}

module.exports = { LightningNetwork, LightningNode, PaymentChannel };
