const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await deployer.provider.getBalance(deployer.address);
  
  console.log("===========================================");
  console.log("  预测市场合约部署脚本");
  console.log("===========================================");
  console.log(`部署者地址: ${deployer.address}`);
  console.log(`部署者余额: ${hre.ethers.formatEther(balance)} MATIC`);
  console.log(`网络: ${hre.network.name}`);
  console.log("-------------------------------------------\n");

  // 1. 部署 PMT 代币
  console.log("📦 步骤 1/3: 部署 PMT (Prediction Market Token)...");
  const PlatformToken = await hre.ethers.getContractFactory("PlatformToken");
  const pmtToken = await hre.ethers.deployContract("PlatformToken", [hre.ethers.parseEther("1000000000")]);
  await pmtToken.waitForDeployment();
  const pmtAddress = await pmtToken.getAddress();
  console.log(`✅ PMT 代币已部署: ${pmtAddress}`);

  // 2. 部署预测市场合约
  console.log("\n📦 步骤 2/3: 部署 PredictionMarket 合约...");
  const PredictionMarket = await hre.ethers.getContractFactory("PredictionMarket");
  const predictionMarket = await hre.ethers.deployContract("PredictionMarket", [pmtAddress]);
  await predictionMarket.waitForDeployment();
  const marketAddress = await predictionMarket.getAddress();
  console.log(`✅ 预测市场合约已部署: ${marketAddress}`);

  // 3. 铸造测试代币（给部署者）
  console.log("\n📦 步骤 3/3: 铸造测试 PMT 代币...");
  const mintAmount = hre.ethers.parseEther("1000000"); // 100万 PMT
  const tx = await pmtToken.mint(deployer.address, mintAmount);
  await tx.wait();
  console.log(`✅ 已铸造 ${hre.ethers.formatEther(mintAmount)} PMT 给 ${deployer.address}`);

  // 验证部署
  console.log("\n===========================================");
  console.log("  部署完成！");
  console.log("===========================================");
  console.log(`\n📝 重要配置（在 .env 文件中设置）:`);
  console.log(`REACT_APP_PMT_TOKEN_ADDRESS=${pmtAddress}`);
  console.log(`REACT_APP_PREDICTION_MARKET_ADDRESS=${marketAddress}`);
  console.log(`\n🎉 所有合约已成功部署到 ${hre.network.name} 网络！`);
  
  // 保存部署信息
  const deploymentInfo = {
    network: hre.network.name,
    chainId: (await hre.ethers.provider.getNetwork()).chainId.toString(),
    timestamp: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      PMTToken: {
        address: pmtAddress,
        name: "PlatformToken"
      },
      PredictionMarket: {
        address: marketAddress,
        name: "PredictionMarket",
        constructorArgs: [pmtAddress]
      }
    }
  };

  const fs = require("fs");
  const deploymentsPath = "./deployments";
  if (!fs.existsSync(deploymentsPath)) {
    fs.mkdirSync(deploymentsPath, { recursive: true });
  }
  fs.writeFileSync(
    `${deploymentsPath}/${hre.network.name}-${Date.now()}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  // 同时更新最新的配置文件
  fs.writeFileSync(
    `${deploymentsPath}/latest.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log(`\n📁 部署信息已保存到: ${deploymentsPath}/latest.json`);
  
  return deploymentInfo;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });
