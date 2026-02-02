/**
 * ClawCoin SegWit 實現
 * 隔離見證 + bech32 地址
 */

const crypto = require('crypto');

// Bech32 編碼字符集
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

class SegWit {
  // ========== Bech32 編碼 ==========
  
  static bech32Polymod(values) {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((b >> i) & 1) chk ^= GEN[i];
      }
    }
    return chk;
  }

  static bech32HrpExpand(hrp) {
    const ret = [];
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) >> 5);
    }
    ret.push(0);
    for (const c of hrp) {
      ret.push(c.charCodeAt(0) & 31);
    }
    return ret;
  }

  static bech32CreateChecksum(hrp, data) {
    const values = this.bech32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    const polymod = this.bech32Polymod(values) ^ 1;
    const ret = [];
    for (let i = 0; i < 6; i++) {
      ret.push((polymod >> (5 * (5 - i))) & 31);
    }
    return ret;
  }

  static bech32Encode(hrp, data) {
    const combined = data.concat(this.bech32CreateChecksum(hrp, data));
    let ret = hrp + '1';
    for (const d of combined) {
      ret += CHARSET[d];
    }
    return ret;
  }

  static bech32Decode(bechString) {
    let hasLower = false, hasUpper = false;
    for (const c of bechString) {
      if (c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126) return null;
      if (c >= 'a' && c <= 'z') hasLower = true;
      if (c >= 'A' && c <= 'Z') hasUpper = true;
    }
    if (hasLower && hasUpper) return null;

    bechString = bechString.toLowerCase();
    const pos = bechString.lastIndexOf('1');
    if (pos < 1 || pos + 7 > bechString.length) return null;

    const hrp = bechString.substring(0, pos);
    const data = [];
    for (let i = pos + 1; i < bechString.length; i++) {
      const d = CHARSET.indexOf(bechString[i]);
      if (d === -1) return null;
      data.push(d);
    }

    if (this.bech32Polymod(this.bech32HrpExpand(hrp).concat(data)) !== 1) return null;

    return { hrp, data: data.slice(0, -6) };
  }

  // 5-bit 轉 8-bit
  static convertBits(data, fromBits, toBits, pad = true) {
    let acc = 0, bits = 0;
    const ret = [];
    const maxv = (1 << toBits) - 1;

    for (const value of data) {
      if (value < 0 || value >> fromBits) return null;
      acc = (acc << fromBits) | value;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        ret.push((acc >> bits) & maxv);
      }
    }

    if (pad) {
      if (bits) ret.push((acc << (toBits - bits)) & maxv);
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
      return null;
    }

    return ret;
  }

  // ========== SegWit 地址 ==========

  // 從公鑰生成 SegWit 地址 (P2WPKH)
  static pubkeyToSegwitAddress(publicKey, hrp = 'cl') {
    // SHA256 + RIPEMD160
    const sha256 = crypto.createHash('sha256').update(Buffer.from(publicKey, 'hex')).digest();
    const pubkeyHash = crypto.createHash('ripemd160').update(sha256).digest();

    // 版本 0 + 轉換為 5-bit
    const words = [0].concat(this.convertBits([...pubkeyHash], 8, 5));
    
    return this.bech32Encode(hrp, words);
  }

  // 從腳本生成 SegWit 地址 (P2WSH)
  static scriptToSegwitAddress(script, hrp = 'cl') {
    const scriptHash = crypto.createHash('sha256').update(script).digest();
    const words = [0].concat(this.convertBits([...scriptHash], 8, 5));
    return this.bech32Encode(hrp, words);
  }

  // 解碼 SegWit 地址
  static decodeSegwitAddress(address, hrp = 'cl') {
    const dec = this.bech32Decode(address);
    if (!dec || dec.hrp !== hrp || dec.data.length < 1) return null;

    const version = dec.data[0];
    const program = this.convertBits(dec.data.slice(1), 5, 8, false);

    if (!program || program.length < 2 || program.length > 40) return null;
    if (version === 0 && program.length !== 20 && program.length !== 32) return null;

    return { version, program: Buffer.from(program) };
  }

  // ========== SegWit 交易 ==========

  // 創建 SegWit 交易
  static createSegwitTx(inputs, outputs, witnesses) {
    return {
      version: 2,
      marker: 0x00,
      flag: 0x01,
      inputs: inputs.map(input => ({
        txid: input.txid,
        vout: input.vout,
        scriptSig: '', // SegWit 輸入的 scriptSig 為空
        sequence: input.sequence || 0xffffffff
      })),
      outputs,
      witnesses, // 見證數據獨立存放
      locktime: 0
    };
  }

  // 計算 SegWit 交易 ID (不包含見證數據)
  static calculateTxid(tx) {
    const data = {
      version: tx.version,
      inputs: tx.inputs,
      outputs: tx.outputs,
      locktime: tx.locktime
    };
    return crypto.createHash('sha256')
      .update(crypto.createHash('sha256').update(JSON.stringify(data)).digest())
      .digest('hex');
  }

  // 計算 wtxid (包含見證數據)
  static calculateWtxid(tx) {
    return crypto.createHash('sha256')
      .update(crypto.createHash('sha256').update(JSON.stringify(tx)).digest())
      .digest('hex');
  }

  // 計算交易權重
  static calculateWeight(tx) {
    const baseSize = JSON.stringify({
      version: tx.version,
      inputs: tx.inputs,
      outputs: tx.outputs,
      locktime: tx.locktime
    }).length;
    
    const witnessSize = JSON.stringify(tx.witnesses || []).length;
    
    // 權重 = 基礎大小 * 4 + 見證大小
    return baseSize * 4 + witnessSize;
  }

  // 計算虛擬大小 (vsize)
  static calculateVsize(tx) {
    return Math.ceil(this.calculateWeight(tx) / 4);
  }
}

module.exports = SegWit;
