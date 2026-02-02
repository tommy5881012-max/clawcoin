/**
 * ClawCoin 時間鎖功能
 * CLTV (CheckLockTimeVerify) 和 CSV (CheckSequenceVerify)
 */

class TimeLock {
  // ========== CLTV - 絕對時間鎖 ==========
  
  // 創建 CLTV 鎖定腳本
  static createCLTV(lockTime, recipientAddress) {
    // lockTime 可以是區塊高度或 Unix 時間戳
    // < 500000000 = 區塊高度
    // >= 500000000 = Unix 時間戳
    return {
      type: 'cltv',
      lockTime,
      lockType: lockTime < 500000000 ? 'block' : 'timestamp',
      recipientAddress,
      script: `OP_CHECKLOCKTIMEVERIFY OP_DROP OP_DUP OP_HASH160 ${recipientAddress} OP_EQUALVERIFY OP_CHECKSIG`
    };
  }

  // 驗證 CLTV
  static verifyCLTV(lockScript, currentBlockHeight, currentTimestamp) {
    if (lockScript.lockType === 'block') {
      return currentBlockHeight >= lockScript.lockTime;
    } else {
      return currentTimestamp >= lockScript.lockTime;
    }
  }

  // ========== CSV - 相對時間鎖 ==========

  // 創建 CSV 鎖定腳本
  static createCSV(sequence, recipientAddress) {
    // sequence 是相對於輸入交易確認後的區塊數或時間
    // 低 22 位是值，第 22 位是時間/區塊標誌
    const isTimeBasedLock = (sequence & 0x00400000) !== 0;
    
    return {
      type: 'csv',
      sequence,
      lockType: isTimeBasedLock ? 'time' : 'blocks',
      lockValue: sequence & 0x0000ffff,
      recipientAddress,
      script: `${sequence} OP_CHECKSEQUENCEVERIFY OP_DROP OP_DUP OP_HASH160 ${recipientAddress} OP_EQUALVERIFY OP_CHECKSIG`
    };
  }

  // 驗證 CSV
  static verifyCSV(lockScript, inputConfirmations, inputAge) {
    if (lockScript.lockType === 'blocks') {
      return inputConfirmations >= lockScript.lockValue;
    } else {
      // 時間以 512 秒為單位
      return inputAge >= lockScript.lockValue * 512;
    }
  }

  // ========== HTLC - 哈希時間鎖合約 ==========
  // (閃電網路基礎)

  static createHTLC(hashLock, timeLock, recipientAddress, refundAddress) {
    return {
      type: 'htlc',
      hashLock, // SHA256 哈希
      timeLock,
      recipientAddress,
      refundAddress,
      script: `
        OP_IF
          OP_SHA256 ${hashLock} OP_EQUALVERIFY
          OP_DUP OP_HASH160 ${recipientAddress}
        OP_ELSE
          ${timeLock} OP_CHECKLOCKTIMEVERIFY OP_DROP
          OP_DUP OP_HASH160 ${refundAddress}
        OP_ENDIF
        OP_EQUALVERIFY OP_CHECKSIG
      `.trim()
    };
  }

  // 用原像解鎖 HTLC
  static unlockHTLCWithPreimage(htlc, preimage) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(preimage).digest('hex');
    
    if (hash === htlc.hashLock) {
      return { success: true, unlockType: 'preimage' };
    }
    return { success: false, error: '原像不匹配' };
  }

  // 超時後退款
  static unlockHTLCWithTimeout(htlc, currentTime) {
    if (currentTime >= htlc.timeLock) {
      return { success: true, unlockType: 'timeout' };
    }
    return { success: false, error: '尚未超時' };
  }
}

module.exports = TimeLock;
