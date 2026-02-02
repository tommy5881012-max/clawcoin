/**
 * ClawCoin 區塊驗證器
 * 完整的區塊和交易驗證
 */

const crypto = require('crypto');

class BlockValidator {
  constructor(blockchain) {
    this.blockchain = blockchain;
  }

  // 驗證區塊
  validateBlock(block, previousBlock) {
    const errors = [];

    // 1. 驗證區塊索引
    if (block.index !== previousBlock.index + 1) {
      errors.push(`區塊索引錯誤: 期望 ${previousBlock.index + 1}, 實際 ${block.index}`);
    }

    // 2. 驗證前一個區塊哈希
    if (block.previousHash !== previousBlock.hash) {
      errors.push('前區塊哈希不匹配');
    }

    // 3. 驗證區塊哈希
    const calculatedHash = this.calculateBlockHash(block);
    if (block.hash !== calculatedHash) {
      errors.push('區塊哈希無效');
    }

    // 4. 驗證工作量證明
    const target = '0'.repeat(block.difficulty || 2);
    if (!block.hash.startsWith(target)) {
      errors.push('工作量證明無效');
    }

    // 5. 驗證時間戳
    const now = Date.now();
    if (block.timestamp > now + 7200000) { // 不能超過未來 2 小時
      errors.push('區塊時間戳在未來');
    }
    if (block.timestamp < previousBlock.timestamp) {
      errors.push('區塊時間戳早於前區塊');
    }

    // 6. 驗證 Merkle Root（如果有）
    if (block.merkleRoot && block.transactions) {
      const calculatedMerkle = this.calculateMerkleRoot(block.transactions);
      if (block.merkleRoot !== calculatedMerkle) {
        errors.push('Merkle Root 無效');
      }
    }

    // 7. 驗證區塊大小
    const blockSize = JSON.stringify(block).length;
    if (blockSize > 1000000) { // 1MB 限制
      errors.push('區塊大小超過限制');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // 計算區塊哈希
  calculateBlockHash(block) {
    const data = {
      index: block.index,
      previousHash: block.previousHash,
      timestamp: block.timestamp,
      transactions: block.transactions,
      nonce: block.nonce,
      difficulty: block.difficulty
    };
    
    return crypto.createHash('sha256')
      .update(crypto.createHash('sha256').update(JSON.stringify(data)).digest())
      .digest('hex');
  }

  // 計算 Merkle Root
  calculateMerkleRoot(transactions) {
    if (!transactions || transactions.length === 0) {
      return crypto.createHash('sha256').update('').digest('hex');
    }

    let hashes = transactions.map(tx => 
      typeof tx === 'string' ? tx : tx.txid || crypto.createHash('sha256').update(JSON.stringify(tx)).digest('hex')
    );

    while (hashes.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        const right = hashes[i + 1] || hashes[i];
        const combined = crypto.createHash('sha256')
          .update(left + right)
          .digest('hex');
        nextLevel.push(combined);
      }
      hashes = nextLevel;
    }

    return hashes[0];
  }

  // 驗證交易
  validateTransaction(tx, utxoSet) {
    const errors = [];

    // 1. 驗證交易結構
    if (!tx.inputs || !tx.outputs) {
      errors.push('交易結構無效');
      return { valid: false, errors };
    }

    // 2. 驗證輸入
    let totalInput = 0;
    for (const input of tx.inputs) {
      if (input.coinbase) continue; // Coinbase 交易跳過

      const utxoKey = `${input.txid}:${input.vout}`;
      const utxo = utxoSet.get(utxoKey);
      
      if (!utxo) {
        errors.push(`UTXO 不存在: ${utxoKey}`);
        continue;
      }

      if (utxo.spent) {
        errors.push(`UTXO 已花費: ${utxoKey}`);
        continue;
      }

      totalInput += utxo.value;

      // 3. 驗證簽名
      if (input.signature && input.publicKey) {
        const valid = this.verifySignature(
          tx.txid,
          input.signature,
          input.publicKey
        );
        if (!valid) {
          errors.push('簽名無效');
        }
      }
    }

    // 4. 驗證輸出
    let totalOutput = 0;
    for (const output of tx.outputs) {
      if (output.value < 0) {
        errors.push('輸出金額為負');
      }
      totalOutput += output.value;
    }

    // 5. 驗證輸入 >= 輸出（差額為手續費）
    if (!tx.inputs[0]?.coinbase && totalInput < totalOutput) {
      errors.push(`輸入不足: ${totalInput} < ${totalOutput}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      fee: totalInput - totalOutput
    };
  }

  // 驗證簽名
  verifySignature(message, signature, publicKey) {
    try {
      const msgHash = crypto.createHash('sha256').update(message).digest();
      return crypto.verify(
        null,
        msgHash,
        {
          key: Buffer.from(publicKey, 'hex'),
          dsaEncoding: 'ieee-p1363'
        },
        Buffer.from(signature, 'hex')
      );
    } catch (e) {
      return false;
    }
  }

  // 驗證整條區塊鏈
  validateChain(chain) {
    const errors = [];

    // 驗證創世區塊
    if (chain.length === 0) {
      errors.push('區塊鏈為空');
      return { valid: false, errors };
    }

    // 驗證每個區塊
    for (let i = 1; i < chain.length; i++) {
      const result = this.validateBlock(chain[i], chain[i - 1]);
      if (!result.valid) {
        errors.push(`區塊 #${i}: ${result.errors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      height: chain.length
    };
  }

  // 選擇最長有效鏈
  selectBestChain(chains) {
    let bestChain = null;
    let bestWork = 0;

    for (const chain of chains) {
      const validation = this.validateChain(chain);
      if (!validation.valid) continue;

      // 計算總工作量
      const totalWork = chain.reduce((sum, block) => {
        return sum + Math.pow(2, block.difficulty || 2);
      }, 0);

      if (totalWork > bestWork) {
        bestWork = totalWork;
        bestChain = chain;
      }
    }

    return bestChain;
  }
}

module.exports = BlockValidator;
