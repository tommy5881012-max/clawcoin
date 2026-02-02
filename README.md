# 🪙 ClawCoin

**The First Cryptocurrency for AI Agents - Like Bitcoin in 2009**

## 🌐 Live Network

**Explorer:** https://clawcoin.onrender.com

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/tommy5881012-max/clawcoin)

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ Features

- 🔐 **ECDSA Signatures** - Same as Bitcoin (secp256k1)
- ⛓️ **UTXO Model** - Real Bitcoin architecture
- ⛏️ **PoW Mining** - SHA256 proof of work
- 🌐 **P2P Network** - Fully decentralized
- ⚡ **Lightning Network** - Layer 2 instant payments
- 📜 **Script System** - Multi-sig, time locks
- 🔒 **Encrypted Wallets** - AES-256-GCM

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/tommy5881012-max/clawcoin.git
cd clawcoin
npm install

# Create wallet
node src/wallet-cli.js create myname

# Start mining
node src/cli.js mine myname

# Check balance
node src/cli.js balance myname
```

---

## 📊 Economics

| Parameter | Value |
|-----------|-------|
| Max Supply | **21,000,000 CLAW** |
| Block Reward | 50 CLAW (halves every 210,000 blocks) |
| Block Time | ~10 minutes |
| Consensus | Proof of Work (PoW) |
| Premine | **0** (Fair Launch) |

---

## 🖥️ Run a Node

```bash
# Start seed node
node src/seed-node.js

# Connect to network
node src/p2p-cli.js connect <host>:6677
```

---

## 🌐 API

| Endpoint | Description |
|----------|-------------|
| `GET /` | Visual dashboard |
| `GET /stats` | Network statistics |
| `GET /leaderboard` | Top miners |
| `GET /balance/:address` | Check balance |

---

## ⚡ Lightning Network

```bash
# Create invoice
node src/index.js lightning invoice 10

# Check status
node src/index.js lightning status
```

---

## 🔐 Security Features

- **Encrypted Wallets** - AES-256-GCM encryption
- **Block Validation** - Full PoW verification
- **Signature Verification** - ECDSA secp256k1

---

## 📁 Architecture

```
src/
├── blockchain.js      # Core blockchain
├── bitcoin-core.js    # UTXO + Merkle
├── wallet.js          # Basic wallet
├── secure-wallet.js   # Encrypted wallet
├── hd-wallet.js       # HD wallet (BIP-32/39/44)
├── multisig.js        # Multi-signature
├── lightning.js       # Lightning Network
├── p2p-node.js        # P2P network
├── validator.js       # Block validation
├── segwit.js          # SegWit
└── seed-node.js       # Full node
```

---

## ⚖️ Fairness

- No premine
- No ICO
- No founder rewards
- All CLAW obtained through mining only
- **Code is Law**

---

## 📬 Community

- **GitHub**: https://github.com/tommy5881012-max/clawcoin
- **Contribute**: PRs welcome

---

**🪙 Join the network. Mine your CLAW. Build the future.**
