/**
 * ClawCoin 多重簽名 (MultiSig)
 * M-of-N 多簽錢包
 */

const crypto = require('crypto');
const Wallet = require('./wallet');

class MultiSigWallet {
  constructor(m, publicKeys) {
    if (m > publicKeys.length) {
      throw new Error('M 不能大於公鑰數量');
    }
    
    this.m = m; // 需要的簽名數
    this.n = publicKeys.length; // 總公鑰數
    this.publicKeys = publicKeys.sort(); // 排序確保一致性
    this.redeemScript = this.createRedeemScript();
    this.address = this.createAddress();
  }

  // 創建贖回腳本
  createRedeemScript() {
    // OP_M <pubkey1> <pubkey2> ... <pubkeyN> OP_N OP_CHECKMULTISIG
    return {
      type: 'multisig',
      m: this.m,
      n: this.n,
      publicKeys: this.publicKeys
    };
  }

  // 創建多簽地址
  createAddress() {
    const scriptHash = crypto.createHash('sha256')
      .update(JSON.stringify(this.redeemScript))
      .digest();
    const ripemd160 = crypto.createHash('ripemd160')
      .update(scriptHash)
      .digest('hex');
    
    // P2SH 地址前綴 "CM" (ClawCoin MultiSig)
    return 'CM' + ripemd160.substring(0, 38);
  }

  // 創建待簽名交易
  createTransaction(inputs, outputs) {
    return {
      version: 1,
      inputs,
      outputs,
      redeemScript: this.redeemScript,
      signatures: [],
      requiredSignatures: this.m,
      txid: null
    };
  }

  // 添加簽名
  addSignature(tx, privateKey, publicKey) {
    // 驗證公鑰是否在多簽列表中
    if (!this.publicKeys.includes(publicKey)) {
      return { success: false, error: '公鑰不在多簽列表中' };
    }

    // 檢查是否已簽名
    if (tx.signatures.find(s => s.publicKey === publicKey)) {
      return { success: false, error: '此公鑰已簽名' };
    }

    // 計算交易哈希
    const txHash = crypto.createHash('sha256')
      .update(JSON.stringify({
        inputs: tx.inputs,
        outputs: tx.outputs,
        redeemScript: tx.redeemScript
      }))
      .digest('hex');

    // 簽名
    const wallet = new Wallet(privateKey);
    const signature = wallet.sign(txHash);

    tx.signatures.push({
      publicKey,
      signature,
      signedAt: Date.now()
    });

    // 檢查是否達到所需簽名數
    if (tx.signatures.length >= this.m) {
      tx.txid = crypto.createHash('sha256')
        .update(JSON.stringify(tx))
        .digest('hex');
      tx.complete = true;
    }

    return { 
      success: true, 
      signaturesCount: tx.signatures.length,
      required: this.m,
      complete: tx.signatures.length >= this.m
    };
  }

  // 驗證交易
  verifyTransaction(tx) {
    if (tx.signatures.length < this.m) {
      return { valid: false, error: '簽名數量不足' };
    }

    const txHash = crypto.createHash('sha256')
      .update(JSON.stringify({
        inputs: tx.inputs,
        outputs: tx.outputs,
        redeemScript: tx.redeemScript
      }))
      .digest('hex');

    let validCount = 0;
    for (const sig of tx.signatures) {
      if (Wallet.verify(txHash, sig.signature, sig.publicKey)) {
        validCount++;
      }
    }

    return {
      valid: validCount >= this.m,
      validSignatures: validCount,
      required: this.m
    };
  }

  // 匯出多簽錢包資訊
  export() {
    return {
      type: 'multisig',
      m: this.m,
      n: this.n,
      address: this.address,
      publicKeys: this.publicKeys,
      redeemScript: this.redeemScript
    };
  }
}

module.exports = MultiSigWallet;
