const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("正在使用账户部署合约:", deployer.address);

  // 1. 部署 Token
  const Token = await hre.ethers.getContractFactory("PlatformToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("PlatformToken 已部署至:", tokenAddress);

  // 2. 部署 PredictionMarket
  // 3. 设置 Token 地址 (通过构造函数)
  const PredictionMarket = await hre.ethers.getContractFactory("PredictionMarket");
  const market = await PredictionMarket.deploy(tokenAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log("PredictionMarket 已部署至:", marketAddress);

  console.log("\n部署完成！");
  console.log("Token 地址:", tokenAddress);
  console.log("市场合约地址:", marketAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
