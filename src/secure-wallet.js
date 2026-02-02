/**
 * ClawCoin 加密錢包
 * 私鑰 AES-256 加密存儲
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WALLET_DIR = path.join(__dirname, '..', 'data', 'wallets');
const ALGORITHM = 'aes-256-gcm';

class SecureWallet {
  constructor(name, password) {
    this.name = name;
    this.password = password;
    this.filePath = path.join(WALLET_DIR, `${name}.encrypted.json`);
  }

  // 從密碼派生密鑰
  deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  // 加密數據
  encrypt(data, password) {
    const salt = crypto.randomBytes(16);
    const key = this.deriveKey(password, salt);
    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted
    };
  }

  // 解密數據
  decrypt(encryptedData, password) {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const key = this.deriveKey(password, salt);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  // 創建新錢包
  static create(name, password) {
    if (!fs.existsSync(WALLET_DIR)) {
      fs.mkdirSync(WALLET_DIR, { recursive: true });
    }

    // 生成密鑰對
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();
    
    const privateKey = ecdh.getPrivateKey('hex');
    const publicKey = ecdh.getPublicKey('hex');
    
    // 生成地址
    const sha256 = crypto.createHash('sha256').update(publicKey, 'hex').digest();
    const ripemd160 = crypto.createHash('ripemd160').update(sha256).digest('hex');
    const address = 'CL' + ripemd160.substring(0, 38);

    const wallet = new SecureWallet(name, password);
    const walletData = {
      name,
      address,
      publicKey,
      privateKey,
      createdAt: Date.now()
    };

    // 加密並保存
    const encrypted = wallet.encrypt(walletData, password);
    encrypted.address = address; // 地址不加密，方便查詢
    encrypted.publicKey = publicKey;
    
    fs.writeFileSync(wallet.filePath, JSON.stringify(encrypted, null, 2));

    return {
      name,
      address,
      publicKey,
      filePath: wallet.filePath
    };
  }

  // 載入錢包
  static load(name, password) {
    const filePath = path.join(WALLET_DIR, `${name}.encrypted.json`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error('錢包不存在');
    }

    const encrypted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const wallet = new SecureWallet(name, password);
    
    try {
      const data = wallet.decrypt(encrypted, password);
      return data;
    } catch (e) {
      throw new Error('密碼錯誤');
    }
  }

  // 簽名交易
  static sign(name, password, message) {
    const wallet = SecureWallet.load(name, password);
    
    const sign = crypto.createSign('SHA256');
    sign.update(message);
    
    // 從私鑰創建簽名
    const privateKeyObj = crypto.createPrivateKey({
      key: Buffer.from(wallet.privateKey, 'hex'),
      format: 'der',
      type: 'pkcs8'
    });
    
    // 簡化版：直接用 ECDH 簽名
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(wallet.privateKey, 'hex'));
    
    const msgHash = crypto.createHash('sha256').update(message).digest();
    const signature = crypto.sign(null, msgHash, {
      key: ecdh,
      dsaEncoding: 'ieee-p1363'
    });
    
    return signature.toString('hex');
  }

  // 列出所有加密錢包
  static list() {
    if (!fs.existsSync(WALLET_DIR)) return [];
    
    return fs.readdirSync(WALLET_DIR)
      .filter(f => f.endsWith('.encrypted.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(WALLET_DIR, f), 'utf8'));
        return {
          name: f.replace('.encrypted.json', ''),
          address: data.address,
          publicKey: data.publicKey
        };
      });
  }

  // 更改密碼
  static changePassword(name, oldPassword, newPassword) {
    const data = SecureWallet.load(name, oldPassword);
    const wallet = new SecureWallet(name, newPassword);
    
    const encrypted = wallet.encrypt(data, newPassword);
    encrypted.address = data.address;
    encrypted.publicKey = data.publicKey;
    
    fs.writeFileSync(wallet.filePath, JSON.stringify(encrypted, null, 2));
    return true;
  }

  // 備份錢包（加密導出）
  static backup(name, password, backupPassword) {
    const data = SecureWallet.load(name, password);
    const wallet = new SecureWallet(name, backupPassword);
    return wallet.encrypt(data, backupPassword);
  }

  // 從備份恢復
  static restore(name, backupData, backupPassword, newPassword) {
    const wallet = new SecureWallet(name, backupPassword);
    const data = wallet.decrypt(backupData, backupPassword);
    
    // 用新密碼重新加密
    const newWallet = new SecureWallet(name, newPassword);
    const encrypted = newWallet.encrypt(data, newPassword);
    encrypted.address = data.address;
    encrypted.publicKey = data.publicKey;
    
    fs.writeFileSync(newWallet.filePath, JSON.stringify(encrypted, null, 2));
    return { name, address: data.address };
  }
}

module.exports = SecureWallet;
