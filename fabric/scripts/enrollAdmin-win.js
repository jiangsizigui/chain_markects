'use strict';
/**
 * enrollAdmin.js (Windows 兼容版)
 * 将 test-network 的 Org1 管理员证书写入 fabric-network 格式的本地 wallet
 * 由 03-start-fabric-network-win.ps1 调用
 */
const fs   = require('fs');
const path = require('path');

const PROJECT_DIR  = path.resolve(__dirname, '..', '..');         // d:\毕业\blockchain-prediction-market-platform
const TEST_NETWORK = path.join(PROJECT_DIR, 'fabric-samples', 'test-network');
const WALLET_DIR   = path.join(PROJECT_DIR, 'fabric', 'wallet');
const CONN_DIR     = path.join(PROJECT_DIR, 'fabric', 'connection-profiles');

fs.mkdirSync(WALLET_DIR, { recursive: true });
fs.mkdirSync(CONN_DIR,   { recursive: true });

const org1Path  = path.join(TEST_NETWORK, 'organizations', 'peerOrganizations', 'org1.example.com');
const adminPath = path.join(org1Path, 'users', 'Admin@org1.example.com', 'msp');

// 读取证书
const certDir   = path.join(adminPath, 'signcerts');
const certFiles = fs.readdirSync(certDir).filter(f => f.endsWith('.pem') || f === 'cert.pem');
const certFile  = certFiles[0];
const certificate = fs.readFileSync(path.join(certDir, certFile), 'utf8');

// 读取私钥
const keyDir   = path.join(adminPath, 'keystore');
const keyFile  = fs.readdirSync(keyDir)[0];
const privateKey = fs.readFileSync(path.join(keyDir, keyFile), 'utf8');

// 写入 wallet identity
const identity = {
  credentials: { certificate, privateKey },
  mspId: 'Org1MSP',
  type: 'X.509',
  version: 1
};

const identityPath = path.join(WALLET_DIR, 'admin.id');
fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2));
console.log('  ✓ Wallet identity 已写入:', identityPath);

// 复制连接配置
const connJsonSrc = path.join(org1Path, 'connection-org1.json');
const connJsonDst = path.join(CONN_DIR, 'connection-org1.json');

if (fs.existsSync(connJsonSrc)) {
  fs.copyFileSync(connJsonSrc, connJsonDst);
  console.log('  ✓ 连接配置已复制:', connJsonDst);
} else {
  console.warn('  ⚠ 未找到 connection-org1.json');
}

console.log('');
console.log('  === .env 配置项 ===');
console.log('  FABRIC_CONNECTION_PROFILE=' + connJsonDst);
console.log('  FABRIC_WALLET_PATH=' + WALLET_DIR);
