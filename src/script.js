/**
 * ClawCoin 完整腳本系統
 * Stack-based Script Language (簡化版比特幣腳本)
 */

const crypto = require('crypto');

class Script {
  constructor() {
    this.stack = [];
    this.altStack = [];
  }

  // 操作碼
  static OPCODES = {
    // 常量
    OP_0: 0x00,
    OP_FALSE: 0x00,
    OP_PUSHDATA1: 0x4c,
    OP_PUSHDATA2: 0x4d,
    OP_PUSHDATA4: 0x4e,
    OP_1NEGATE: 0x4f,
    OP_TRUE: 0x51,
    OP_1: 0x51,
    OP_2: 0x52,
    OP_3: 0x53,
    OP_16: 0x60,

    // 流程控制
    OP_NOP: 0x61,
    OP_IF: 0x63,
    OP_NOTIF: 0x64,
    OP_ELSE: 0x67,
    OP_ENDIF: 0x68,
    OP_VERIFY: 0x69,
    OP_RETURN: 0x6a,

    // 棧操作
    OP_TOALTSTACK: 0x6b,
    OP_FROMALTSTACK: 0x6c,
    OP_DUP: 0x76,
    OP_DROP: 0x75,
    OP_SWAP: 0x7c,
    OP_EQUAL: 0x87,
    OP_EQUALVERIFY: 0x88,

    // 算術
    OP_ADD: 0x93,
    OP_SUB: 0x94,

    // 加密
    OP_RIPEMD160: 0xa6,
    OP_SHA256: 0xa8,
    OP_HASH160: 0xa9,
    OP_HASH256: 0xaa,
    OP_CHECKSIG: 0xac,
    OP_CHECKMULTISIG: 0xae,

    // 時間鎖
    OP_CHECKLOCKTIMEVERIFY: 0xb1,
    OP_CHECKSEQUENCEVERIFY: 0xb2
  };

  // 執行腳本
  execute(scriptStr, context = {}) {
    const tokens = this.tokenize(scriptStr);
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // 如果是數據，直接壓棧
      if (!token.startsWith('OP_')) {
        this.stack.push(token);
        continue;
      }

      // 執行操作碼
      const result = this.executeOp(token, context, tokens, i);
      if (result === false) {
        return { success: false, error: `腳本執行失敗: ${token}` };
      }
      if (typeof result === 'number') {
        i = result; // 跳轉
      }
    }

    // 腳本成功條件：棧頂為 true 或非空
    const top = this.stack.pop();
    return { 
      success: top === true || top === '1' || (top && top !== '0'),
      stack: this.stack
    };
  }

  tokenize(scriptStr) {
    return scriptStr.split(/\s+/).filter(t => t);
  }

  executeOp(op, context, tokens, index) {
    switch (op) {
      // 棧操作
      case 'OP_DUP':
        if (this.stack.length < 1) return false;
        this.stack.push(this.stack[this.stack.length - 1]);
        break;

      case 'OP_DROP':
        if (this.stack.length < 1) return false;
        this.stack.pop();
        break;

      case 'OP_SWAP':
        if (this.stack.length < 2) return false;
        const a = this.stack.pop();
        const b = this.stack.pop();
        this.stack.push(a, b);
        break;

      case 'OP_EQUAL':
        if (this.stack.length < 2) return false;
        const eq1 = this.stack.pop();
        const eq2 = this.stack.pop();
        this.stack.push(eq1 === eq2);
        break;

      case 'OP_EQUALVERIFY':
        if (this.stack.length < 2) return false;
        const v1 = this.stack.pop();
        const v2 = this.stack.pop();
        if (v1 !== v2) return false;
        break;

      case 'OP_VERIFY':
        if (this.stack.length < 1) return false;
        const verify = this.stack.pop();
        if (!verify || verify === '0') return false;
        break;

      // 哈希操作
      case 'OP_SHA256':
        if (this.stack.length < 1) return false;
        const sha256Input = this.stack.pop();
        const sha256Hash = crypto.createHash('sha256').update(sha256Input).digest('hex');
        this.stack.push(sha256Hash);
        break;

      case 'OP_HASH160':
        if (this.stack.length < 1) return false;
        const h160Input = this.stack.pop();
        const sha = crypto.createHash('sha256').update(h160Input).digest();
        const ripemd = crypto.createHash('ripemd160').update(sha).digest('hex');
        this.stack.push(ripemd);
        break;

      case 'OP_RIPEMD160':
        if (this.stack.length < 1) return false;
        const rInput = this.stack.pop();
        const rHash = crypto.createHash('ripemd160').update(rInput).digest('hex');
        this.stack.push(rHash);
        break;

      // 簽名驗證（簡化版）
      case 'OP_CHECKSIG':
        if (this.stack.length < 2) return false;
        const pubKey = this.stack.pop();
        const sig = this.stack.pop();
        // 實際驗證需要交易上下文
        const sigValid = context.verifySignature?.(sig, pubKey) ?? true;
        this.stack.push(sigValid);
        break;

      case 'OP_CHECKMULTISIG':
        // M-of-N 多簽驗證
        const n = parseInt(this.stack.pop());
        const pubKeys = [];
        for (let j = 0; j < n; j++) {
          pubKeys.push(this.stack.pop());
        }
        const m = parseInt(this.stack.pop());
        const sigs = [];
        for (let j = 0; j < m; j++) {
          sigs.push(this.stack.pop());
        }
        this.stack.pop(); // 比特幣 bug 兼容
        
        // 驗證簽名
        let validSigs = 0;
        for (const sig of sigs) {
          for (const pk of pubKeys) {
            if (context.verifySignature?.(sig, pk)) {
              validSigs++;
              break;
            }
          }
        }
        this.stack.push(validSigs >= m);
        break;

      // 時間鎖
      case 'OP_CHECKLOCKTIMEVERIFY':
        if (this.stack.length < 1) return false;
        const lockTime = parseInt(this.stack[this.stack.length - 1]);
        if (!context.currentTime || context.currentTime < lockTime) {
          return false;
        }
        break;

      case 'OP_CHECKSEQUENCEVERIFY':
        if (this.stack.length < 1) return false;
        const sequence = parseInt(this.stack[this.stack.length - 1]);
        if (!context.inputAge || context.inputAge < sequence) {
          return false;
        }
        break;

      // 流程控制
      case 'OP_IF':
        const condition = this.stack.pop();
        if (!condition || condition === '0') {
          // 跳到 OP_ELSE 或 OP_ENDIF
          let depth = 1;
          for (let j = index + 1; j < tokens.length; j++) {
            if (tokens[j] === 'OP_IF') depth++;
            if (tokens[j] === 'OP_ENDIF') depth--;
            if (tokens[j] === 'OP_ELSE' && depth === 1) {
              return j;
            }
            if (depth === 0) return j;
          }
        }
        break;

      case 'OP_ELSE':
        // 跳到 OP_ENDIF
        let elseDepth = 1;
        for (let j = index + 1; j < tokens.length; j++) {
          if (tokens[j] === 'OP_IF') elseDepth++;
          if (tokens[j] === 'OP_ENDIF') elseDepth--;
          if (elseDepth === 0) return j;
        }
        break;

      case 'OP_ENDIF':
        // 繼續執行
        break;

      case 'OP_RETURN':
        // 標記交易為不可花費（用於 OP_RETURN 數據）
        return false;

      case 'OP_NOP':
        break;

      case 'OP_TRUE':
      case 'OP_1':
        this.stack.push(true);
        break;

      case 'OP_FALSE':
      case 'OP_0':
        this.stack.push(false);
        break;

      default:
        // 未知操作碼
        console.log(`未知操作碼: ${op}`);
    }

    return true;
  }

  // 創建 P2PKH 腳本
  static createP2PKH(pubKeyHash) {
    return `OP_DUP OP_HASH160 ${pubKeyHash} OP_EQUALVERIFY OP_CHECKSIG`;
  }

  // 創建 P2SH 腳本
  static createP2SH(scriptHash) {
    return `OP_HASH160 ${scriptHash} OP_EQUAL`;
  }

  // 創建 OP_RETURN 數據腳本
  static createOpReturn(data) {
    const hex = Buffer.from(data).toString('hex');
    return `OP_RETURN ${hex}`;
  }
}

module.exports = Script;
