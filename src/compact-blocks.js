/**
 * ClawCoin Compact Blocks (BIP-152)
 * 區塊壓縮傳輸
 */

const crypto = require('crypto');

class CompactBlocks {
  constructor() {
    this.recentTxs = new Map(); // shortId -> txid
    this.pendingBlocks = new Map(); // blockHash -> missing txs
  }

  // ========== Short ID 計算 ==========

  // 計算交易的 Short ID
  calculateShortId(txid, sipHashKey) {
    // 使用 SipHash-2-4 的簡化版
    const data = Buffer.concat([
      sipHashKey,
      Buffer.from(txid, 'hex')
    ]);
    
    const hash = crypto.createHash('sha256').update(data).digest();
    // 取前 6 bytes 作為 short ID
    return hash.slice(0, 6).toString('hex');
  }

  // 生成 SipHash 密鑰
  generateSipHashKey(blockHeader, nonce) {
    const data = Buffer.concat([
      Buffer.from(JSON.stringify(blockHeader)),
      Buffer.from(nonce.toString())
    ]);
    return crypto.createHash('sha256').update(data).digest().slice(0, 16);
  }

  // ========== Compact Block 創建 ==========

  // 創建 Compact Block
  createCompactBlock(block) {
    const nonce = crypto.randomBytes(8).readBigUInt64LE();
    const sipHashKey = this.generateSipHashKey(block, nonce);

    // 計算每個交易的 short ID
    const shortIds = block.transactions.slice(1).map(tx => // 跳過 coinbase
      this.calculateShortId(tx.txid, sipHashKey)
    );

    return {
      header: {
        version: block.version,
        previousHash: block.previousHash,
        merkleRoot: block.merkleRoot,
        timestamp: block.timestamp,
        difficulty: block.difficulty,
        nonce: block.nonce,
        hash: block.hash
      },
      nonce: nonce.toString(),
      shortIds,
      prefilledTxs: [
        { index: 0, tx: block.transactions[0] } // Coinbase 總是包含
      ]
    };
  }

  // ========== Compact Block 處理 ==========

  // 接收 Compact Block
  receiveCompactBlock(compactBlock, mempool) {
    const { header, nonce, shortIds, prefilledTxs } = compactBlock;
    const sipHashKey = this.generateSipHashKey(header, BigInt(nonce));

    // 建立 mempool 的 short ID 索引
    const mempoolIndex = new Map();
    for (const item of mempool) {
      const shortId = this.calculateShortId(item.tx.txid, sipHashKey);
      mempoolIndex.set(shortId, item.tx);
    }

    // 重建區塊
    const transactions = [];
    const missing = [];
    let txIndex = 0;

    // 添加預填充的交易
    for (const prefilled of prefilledTxs) {
      while (txIndex < prefilled.index) {
        const shortId = shortIds[txIndex - (prefilledTxs.filter(p => p.index < txIndex).length)];
        const tx = mempoolIndex.get(shortId);
        if (tx) {
          transactions.push(tx);
        } else {
          missing.push({ index: txIndex, shortId });
          transactions.push(null); // 佔位
        }
        txIndex++;
      }
      transactions.push(prefilled.tx);
      txIndex++;
    }

    // 處理剩餘的 short IDs
    const remainingShortIds = shortIds.slice(
      txIndex - prefilledTxs.length
    );
    for (const shortId of remainingShortIds) {
      const tx = mempoolIndex.get(shortId);
      if (tx) {
        transactions.push(tx);
      } else {
        missing.push({ index: transactions.length, shortId });
        transactions.push(null);
      }
    }

    if (missing.length > 0) {
      // 需要請求缺失的交易
      this.pendingBlocks.set(header.hash, {
        header,
        transactions,
        missing
      });
      
      return {
        complete: false,
        missing,
        blockHash: header.hash
      };
    }

    // 完整的區塊
    return {
      complete: true,
      block: {
        ...header,
        transactions
      }
    };
  }

  // 請求缺失的交易
  createGetBlockTxn(blockHash, indexes) {
    return {
      type: 'getblocktxn',
      blockHash,
      indexes
    };
  }

  // 接收缺失的交易
  receiveBlockTxn(blockHash, txs) {
    const pending = this.pendingBlocks.get(blockHash);
    if (!pending) {
      return { success: false, error: '找不到待處理的區塊' };
    }

    // 填充缺失的交易
    for (let i = 0; i < pending.missing.length; i++) {
      const { index } = pending.missing[i];
      pending.transactions[index] = txs[i];
    }

    // 檢查是否完整
    if (pending.transactions.includes(null)) {
      return { success: false, error: '仍有缺失的交易' };
    }

    this.pendingBlocks.delete(blockHash);

    return {
      success: true,
      block: {
        ...pending.header,
        transactions: pending.transactions
      }
    };
  }

  // ========== 高帶寬/低帶寬模式 ==========

  // 高帶寬模式：主動發送 compact blocks
  // 低帶寬模式：先發送區塊頭，等對方請求

  // 發送區塊公告（低帶寬模式）
  createBlockAnnouncement(blockHash) {
    return {
      type: 'inv',
      items: [{ type: 'block', hash: blockHash }]
    };
  }

  // 請求 compact block
  createGetCompactBlock(blockHash) {
    return {
      type: 'getdata',
      items: [{ type: 'cmpctblock', hash: blockHash }]
    };
  }

  // ========== 統計 ==========

  // 計算節省的帶寬
  calculateBandwidthSaving(fullBlock, compactBlock) {
    const fullSize = JSON.stringify(fullBlock).length;
    const compactSize = JSON.stringify(compactBlock).length;
    const saved = fullSize - compactSize;
    const percentage = (saved / fullSize * 100).toFixed(1);

    return {
      fullSize,
      compactSize,
      saved,
      percentage: `${percentage}%`
    };
  }
}

module.exports = CompactBlocks;
