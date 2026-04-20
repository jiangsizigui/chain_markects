'use strict';
/**
 * enrollAdmin.js
 * 将 test-network 的 Org1 管理员证书写入 fabric-network 格式的本地 wallet
 * 由 start-network.sh 在部署完成后自动调用
 */
const fs   = require('fs');
const path = require('path');

// 路径（WSL 中）
const PROJECT_DIR  = process.env.PROJECT_DIR || '/mnt/d/毕业/blockchain-prediction-market-platform';
const TEST_NETWORK = path.join(PROJECT_DIR, 'fabric-samples', 'test-network');
const WALLET_DIR   = path.join(PROJECT_DIR, 'fabric', 'wallet');
const CONN_DIR     = path.join(PROJECT_DIR, 'fabric', 'connection-profiles');

fs.mkdirSync(WALLET_DIR, { recursive: true });
fs.mkdirSync(CONN_DIR,   { recursive: true });

const org1Path = path.join(TEST_NETWORK, 'organizations', 'peerOrganizations', 'org1.example.com');
const adminPath = path.join(org1Path, 'users', 'Admin@org1.example.com', 'msp');

// 读取证书
const certDir = path.join(adminPath, 'signcerts');
const certFile = fs.readdirSync(certDir).find(f => f.endsWith('.pem') || f === 'cert.pem');
const certificate = fs.readFileSync(path.join(certDir, certFile || fs.readdirSync(certDir)[0]), 'utf8');

// 读取私钥
const keyDir = path.join(adminPath, 'keystore');
const keyFile = fs.readdirSync(keyDir)[0];
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
console.log('  ✓ 管理员 wallet identity 已写入:', identityPath);

// 检查连接配置是否存在（JSON 优先，YAML 备选）
const connJsonSrc = path.join(org1Path, 'connection-org1.json');
const connYamlSrc = path.join(org1Path, 'connection-org1.yaml');
const connJsonDst = path.join(CONN_DIR, 'connection-org1.json');

if (fs.existsSync(connJsonSrc)) {
  fs.copyFileSync(connJsonSrc, connJsonDst);
  console.log('  ✓ 连接配置已复制:', connJsonDst);
} else if (fs.existsSync(connYamlSrc)) {
  // 将 yaml 路径写入提示，用户需要手动确认
  console.log('  ! 连接配置为 YAML 格式:', connYamlSrc);
  console.log('    已复制到:', path.join(CONN_DIR, 'connection-org1.yaml'));
  fs.copyFileSync(connYamlSrc, path.join(CONN_DIR, 'connection-org1.yaml'));
} else {
  console.warn('  ⚠ 未找到连接配置文件，请手动从以下路径复制:');
  console.warn('   ', org1Path);
}

console.log('');
console.log('  Wallet 路径 (Windows 路径，用于 .env):');
// 将 WSL 路径转换为 Windows 路径提示
const winWallet = WALLET_DIR.replace('/mnt/d/', 'D:\\').replace(/\//g, '\\');
const winConn   = connJsonDst.replace('/mnt/d/', 'D:\\').replace(/\//g, '\\');
console.log('    FABRIC_WALLET_PATH=' + winWallet);
console.log('    FABRIC_CONNECTION_PROFILE=' + winConn);
