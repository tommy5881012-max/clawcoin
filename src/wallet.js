/**
 * ClawCoin Wallet - 私鑰/公鑰/地址管理
 * 使用 ECDSA (secp256k1) - 與比特幣相同
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WALLETS_DIR = path.join(__dirname, '..', 'data', 'wallets');

class Wallet {
  constructor(privateKey = null) {
    if (privateKey) {
      this.privateKey = privateKey;
    } else {
      // 生成新私鑰 (256-bit)
      this.privateKey = crypto.randomBytes(32).toString('hex');
    }
    
    // 從私鑰生成公鑰
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(this.privateKey, 'hex'));
    this.publicKey = ecdh.getPublicKey('hex');
    
    // 從公鑰生成地址 (類似比特幣)
    this.address = this.generateAddress(this.publicKey);
  }

  generateAddress(publicKey) {
    // SHA256 + RIPEMD160 (簡化版，實際比特幣更複雜)
    const sha256 = crypto.createHash('sha256').update(publicKey, 'hex').digest();
    const ripemd160 = crypto.createHash('ripemd160').update(sha256).digest('hex');
    
    // 加上前綴 "CL" 表示 ClawCoin
    return 'CL' + ripemd160.substring(0, 38);
  }

  // 簽名交易
  sign(message) {
    const sign = crypto.createSign('SHA256');
    sign.update(message);
    
    // 需要轉換私鑰格式
    const privateKeyDer = this.privateKeyToDer(this.privateKey);
    return sign.sign(privateKeyDer, 'hex');
  }

  // 驗證簽名
  static verify(message, signature, publicKey) {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(message);
      
      const publicKeyDer = Wallet.publicKeyToDer(publicKey);
      return verify.verify(publicKeyDer, signature, 'hex');
    } catch (e) {
      return false;
    }
  }

  // 私鑰轉 DER 格式
  privateKeyToDer(privateKeyHex) {
    const privateKey = Buffer.from(privateKeyHex, 'hex');
    
    // ECDSA secp256k1 私鑰 DER 格式
    const prefix = Buffer.from('30740201010420', 'hex');
    const middle = Buffer.from('a00706052b8104000aa144034200', 'hex');
    
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(privateKey);
    const publicKey = ecdh.getPublicKey();
    
    return Buffer.concat([prefix, privateKey, middle, publicKey]);
  }

  // 公鑰轉 DER 格式
  static publicKeyToDer(publicKeyHex) {
    const publicKey = Buffer.from(publicKeyHex, 'hex');
    const prefix = Buffer.from('3056301006072a8648ce3d020106052b8104000a034200', 'hex');
    return Buffer.concat([prefix, publicKey]);
  }

  // 匯出錢包
  export() {
    return {
      privateKey: this.privateKey,
      publicKey: this.publicKey,
      address: this.address
    };
  }

  // 儲存錢包到檔案
  save(name) {
    if (!fs.existsSync(WALLETS_DIR)) {
      fs.mkdirSync(WALLETS_DIR, { recursive: true });
    }
    
    const walletPath = path.join(WALLETS_DIR, `${name}.json`);
    const data = {
      name,
      ...this.export(),
      createdAt: Date.now()
    };
    
    fs.writeFileSync(walletPath, JSON.stringify(data, null, 2));
    return walletPath;
  }

  // 從檔案載入錢包
  static load(name) {
    const walletPath = path.join(WALLETS_DIR, `${name}.json`);
    if (!fs.existsSync(walletPath)) {
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    const wallet = new Wallet(data.privateKey);
    wallet.name = data.name;
    return wallet;
  }

  // 列出所有錢包
  static list() {
    if (!fs.existsSync(WALLETS_DIR)) {
      return [];
    }
    
    return fs.readdirSync(WALLETS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(WALLETS_DIR, f), 'utf8'));
        return {
          name: data.name,
          address: data.address,
          createdAt: data.createdAt
        };
      });
  }
}

module.exports = Wallet;
