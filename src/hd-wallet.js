/**
 * ClawCoin HD Wallet - BIP-32/39/44 實現
 * 階層確定性錢包
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// BIP-39 簡化版助記詞表（2048 個詞，這裡用前 256 個示範）
const WORDLIST = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
  'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
  'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
  'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
  'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
  'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
  'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
  'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
  'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
  'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
  'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
  'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
  'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
  'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
  'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
  'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base',
  'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt',
  'bench', 'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle',
  'bid', 'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black',
  'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood',
  'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring',
  'borrow', 'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain',
  'brand', 'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief',
  'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother',
  'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus',
  'business', 'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable'
];

class HDWallet {
  constructor(mnemonic = null) {
    if (mnemonic) {
      this.mnemonic = mnemonic;
    } else {
      this.mnemonic = this.generateMnemonic();
    }
    this.seed = this.mnemonicToSeed(this.mnemonic);
    this.masterKey = this.deriveMasterKey(this.seed);
    this.accounts = [];
  }

  // 生成 12 個助記詞
  generateMnemonic(wordCount = 12) {
    const entropy = crypto.randomBytes(wordCount * 4 / 3);
    const words = [];
    
    for (let i = 0; i < wordCount; i++) {
      const index = entropy[i] % WORDLIST.length;
      words.push(WORDLIST[index]);
    }
    
    return words.join(' ');
  }

  // 助記詞轉種子
  mnemonicToSeed(mnemonic, passphrase = '') {
    const salt = 'mnemonic' + passphrase;
    return crypto.pbkdf2Sync(mnemonic, salt, 2048, 64, 'sha512');
  }

  // 推導主私鑰
  deriveMasterKey(seed) {
    const hmac = crypto.createHmac('sha512', 'ClawCoin seed');
    hmac.update(seed);
    const I = hmac.digest();
    
    return {
      privateKey: I.slice(0, 32).toString('hex'),
      chainCode: I.slice(32).toString('hex')
    };
  }

  // BIP-44 路徑推導
  // m / purpose' / coin_type' / account' / change / address_index
  derivePath(path) {
    const segments = path.split('/').slice(1); // 移除 'm'
    let key = this.masterKey;
    
    for (const segment of segments) {
      const hardened = segment.endsWith("'");
      const index = parseInt(segment.replace("'", ''));
      key = this.deriveChild(key, index, hardened);
    }
    
    return key;
  }

  // 子密鑰推導
  deriveChild(parentKey, index, hardened = false) {
    const data = Buffer.alloc(37);
    
    if (hardened) {
      data[0] = 0x00;
      Buffer.from(parentKey.privateKey, 'hex').copy(data, 1);
      data.writeUInt32BE(index + 0x80000000, 33);
    } else {
      // 非硬化推導（簡化版）
      Buffer.from(parentKey.privateKey, 'hex').copy(data, 1);
      data.writeUInt32BE(index, 33);
    }
    
    const hmac = crypto.createHmac('sha512', Buffer.from(parentKey.chainCode, 'hex'));
    hmac.update(data);
    const I = hmac.digest();
    
    // 計算子私鑰
    const il = BigInt('0x' + I.slice(0, 32).toString('hex'));
    const parentPriv = BigInt('0x' + parentKey.privateKey);
    const n = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    const childPriv = (il + parentPriv) % n;
    
    return {
      privateKey: childPriv.toString(16).padStart(64, '0'),
      chainCode: I.slice(32).toString('hex')
    };
  }

  // 生成地址
  generateAddress(index, change = 0, account = 0) {
    // BIP-44 路徑: m/44'/0'/account'/change/index
    const path = `m/44'/777'/${account}'/${change}/${index}`;
    const key = this.derivePath(path);
    
    // 從私鑰生成公鑰和地址
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(Buffer.from(key.privateKey, 'hex'));
    const publicKey = ecdh.getPublicKey('hex');
    
    // 生成地址
    const sha256 = crypto.createHash('sha256').update(publicKey, 'hex').digest();
    const ripemd160 = crypto.createHash('ripemd160').update(sha256).digest('hex');
    const address = 'CL' + ripemd160.substring(0, 38);
    
    return {
      path,
      privateKey: key.privateKey,
      publicKey,
      address,
      index
    };
  }

  // 批量生成地址
  generateAddresses(count, account = 0) {
    const addresses = [];
    for (let i = 0; i < count; i++) {
      addresses.push(this.generateAddress(i, 0, account));
    }
    return addresses;
  }

  // 匯出錢包
  export() {
    return {
      mnemonic: this.mnemonic,
      masterPrivateKey: this.masterKey.privateKey,
      masterChainCode: this.masterKey.chainCode
    };
  }

  // 儲存錢包
  save(name, walletDir) {
    const dir = walletDir || path.join(__dirname, '..', 'data', 'wallets');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filePath = path.join(dir, `${name}.hd.json`);
    const data = {
      name,
      type: 'hd',
      mnemonic: this.mnemonic, // ⚠️ 生產環境應加密
      createdAt: Date.now()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return filePath;
  }

  // 載入錢包
  static load(name, walletDir) {
    const dir = walletDir || path.join(__dirname, '..', 'data', 'wallets');
    const filePath = path.join(dir, `${name}.hd.json`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return new HDWallet(data.mnemonic);
  }
}

module.exports = HDWallet;
