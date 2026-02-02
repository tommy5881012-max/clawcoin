/**
 * ClawCoin RBF (Replace-By-Fee)
 * 手續費替換 - 用更高手續費替換未確認交易
 */

class RBF {
  constructor(mempool) {
    this.mempool = mempool; // 交易池引用
  }

  // 檢查交易是否支持 RBF
  static isRBFEnabled(tx) {
    // nSequence < 0xffffffff - 1 表示支持 RBF
    return tx.inputs.some(input => input.sequence < 0xfffffffe);
  }

  // 創建支持 RBF 的交易
  static enableRBF(tx) {
    tx.inputs = tx.inputs.map(input => ({
      ...input,
      sequence: 0xfffffffd // 啟用 RBF
    }));
    return tx;
  }

  // 嘗試替換交易
  replaceTx(originalTxid, newTx) {
    // 找到原交易
    const originalIndex = this.mempool.findIndex(item => item.tx.txid === originalTxid);
    
    if (originalIndex === -1) {
      return { success: false, error: '找不到原交易' };
    }

    const original = this.mempool[originalIndex];

    // 驗證 RBF 條件
    // 1. 原交易必須支持 RBF
    if (!RBF.isRBFEnabled(original.tx)) {
      return { success: false, error: '原交易不支持 RBF' };
    }

    // 2. 新交易必須花費相同的輸入
    const originalInputs = new Set(
      original.tx.inputs.map(i => `${i.txid}:${i.vout}`)
    );
    const newInputs = new Set(
      newTx.inputs.map(i => `${i.txid}:${i.vout}`)
    );
    
    for (const input of originalInputs) {
      if (!newInputs.has(input)) {
        return { success: false, error: '新交易必須花費原交易的所有輸入' };
      }
    }

    // 3. 新手續費必須更高
    const newFee = this.calculateFee(newTx);
    const minFee = original.fee * 1.1; // 至少高 10%
    
    if (newFee < minFee) {
      return { 
        success: false, 
        error: `手續費不足，需要至少 ${minFee.toFixed(8)} CLAW` 
      };
    }

    // 替換交易
    this.mempool[originalIndex] = {
      tx: newTx,
      fee: newFee,
      timestamp: Date.now(),
      replacedTxid: originalTxid
    };

    return {
      success: true,
      originalTxid,
      newTxid: newTx.txid,
      oldFee: original.fee,
      newFee
    };
  }

  calculateFee(tx) {
    // 這裡應該從 UTXO 集合計算
    // 簡化版：假設已經設定好
    return tx.fee || 0;
  }

  // 獲取可替換的交易
  getReplaceableTxs() {
    return this.mempool.filter(item => RBF.isRBFEnabled(item.tx));
  }
}

module.exports = RBF;
