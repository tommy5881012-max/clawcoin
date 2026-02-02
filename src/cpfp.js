/**
 * ClawCoin CPFP (Child Pays For Parent)
 * 子交易幫父交易加速確認
 */

class CPFP {
  constructor(mempool, utxoSet) {
    this.mempool = mempool;
    this.utxoSet = utxoSet;
  }

  // 計算交易的有效費率（考慮祖先）
  calculateEffectiveFeeRate(tx) {
    const ancestors = this.getAncestors(tx);
    
    let totalFee = tx.fee || 0;
    let totalSize = this.getTxSize(tx);

    for (const ancestor of ancestors) {
      totalFee += ancestor.fee || 0;
      totalSize += this.getTxSize(ancestor);
    }

    return totalFee / totalSize;
  }

  // 獲取交易的所有未確認祖先
  getAncestors(tx, visited = new Set()) {
    const ancestors = [];

    for (const input of tx.inputs) {
      if (visited.has(input.txid)) continue;
      visited.add(input.txid);

      // 在 mempool 中查找父交易
      const parentTx = this.mempool.find(item => item.tx.txid === input.txid);
      if (parentTx) {
        ancestors.push(parentTx.tx);
        // 遞歸獲取祖先的祖先
        ancestors.push(...this.getAncestors(parentTx.tx, visited));
      }
    }

    return ancestors;
  }

  // 獲取交易的所有後代
  getDescendants(tx, visited = new Set()) {
    const descendants = [];
    visited.add(tx.txid);

    for (const item of this.mempool) {
      if (visited.has(item.tx.txid)) continue;

      // 檢查是否花費了 tx 的輸出
      for (const input of item.tx.inputs) {
        if (input.txid === tx.txid) {
          visited.add(item.tx.txid);
          descendants.push(item.tx);
          descendants.push(...this.getDescendants(item.tx, visited));
          break;
        }
      }
    }

    return descendants;
  }

  // 創建 CPFP 交易來加速父交易
  createCPFPTransaction(parentTxid, parentVout, privateKey, targetFeeRate) {
    // 找到父交易
    const parentItem = this.mempool.find(item => item.tx.txid === parentTxid);
    if (!parentItem) {
      return { success: false, error: '找不到父交易' };
    }

    const parentTx = parentItem.tx;
    const parentOutput = parentTx.outputs[parentVout];
    if (!parentOutput) {
      return { success: false, error: '無效的輸出索引' };
    }

    // 計算需要的總手續費
    const parentSize = this.getTxSize(parentTx);
    const childSize = 200; // 估計子交易大小
    const totalSize = parentSize + childSize;
    const requiredTotalFee = totalSize * targetFeeRate;
    const parentFee = parentItem.fee || 0;
    const childFee = requiredTotalFee - parentFee;

    if (childFee <= 0) {
      return { success: false, error: '父交易費率已足夠' };
    }

    // 子交易輸出金額
    const childOutputAmount = parentOutput.value - childFee;
    if (childOutputAmount <= 0) {
      return { success: false, error: '餘額不足支付手續費' };
    }

    // 創建子交易
    const childTx = {
      version: 2,
      inputs: [{
        txid: parentTxid,
        vout: parentVout,
        sequence: 0xffffffff
      }],
      outputs: [{
        value: childOutputAmount,
        scriptPubKey: parentOutput.scriptPubKey // 發回給自己
      }],
      fee: childFee
    };

    return {
      success: true,
      childTx,
      parentFee,
      childFee,
      totalFee: parentFee + childFee,
      effectiveFeeRate: (parentFee + childFee) / totalSize
    };
  }

  // 按有效費率排序 mempool
  sortMempoolByEffectiveFeeRate() {
    return [...this.mempool].sort((a, b) => {
      const rateA = this.calculateEffectiveFeeRate(a.tx);
      const rateB = this.calculateEffectiveFeeRate(b.tx);
      return rateB - rateA;
    });
  }

  // 選擇要打包的交易（考慮 CPFP）
  selectTransactions(maxBlockSize) {
    const sorted = this.sortMempoolByEffectiveFeeRate();
    const selected = [];
    let blockSize = 0;
    const included = new Set();

    for (const item of sorted) {
      if (included.has(item.tx.txid)) continue;

      // 必須包含所有祖先
      const ancestors = this.getAncestors(item.tx);
      const package_ = [...ancestors, item.tx];
      
      let packageSize = 0;
      for (const tx of package_) {
        if (!included.has(tx.txid)) {
          packageSize += this.getTxSize(tx);
        }
      }

      if (blockSize + packageSize <= maxBlockSize) {
        for (const tx of package_) {
          if (!included.has(tx.txid)) {
            selected.push(tx);
            included.add(tx.txid);
            blockSize += this.getTxSize(tx);
          }
        }
      }
    }

    return selected;
  }

  getTxSize(tx) {
    return JSON.stringify(tx).length;
  }

  // 分析交易加速選項
  analyzeAcceleration(txid) {
    const item = this.mempool.find(i => i.tx.txid === txid);
    if (!item) {
      return { success: false, error: '交易不在 mempool 中' };
    }

    const currentFeeRate = item.fee / this.getTxSize(item.tx);
    const descendants = this.getDescendants(item.tx);

    // 計算不同目標費率需要的 CPFP 手續費
    const feeRates = [1, 5, 10, 20, 50]; // sat/byte
    const options = feeRates.map(targetRate => {
      const totalSize = this.getTxSize(item.tx) + 200;
      const requiredFee = totalSize * targetRate;
      const additionalFee = requiredFee - item.fee;
      
      return {
        targetFeeRate: targetRate,
        requiredAdditionalFee: Math.max(0, additionalFee),
        estimatedBlocks: this.estimateConfirmationBlocks(targetRate)
      };
    });

    return {
      success: true,
      txid,
      currentFeeRate,
      currentFee: item.fee,
      descendants: descendants.length,
      accelerationOptions: options
    };
  }

  estimateConfirmationBlocks(feeRate) {
    if (feeRate >= 50) return 1;
    if (feeRate >= 20) return 2;
    if (feeRate >= 10) return 3;
    if (feeRate >= 5) return 6;
    return 12;
  }
}

module.exports = CPFP;
