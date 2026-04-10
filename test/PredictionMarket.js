const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PredictionMarket", function () {
  let token;
  let market;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // 部署 Token
    const Token = await ethers.getContractFactory("PlatformToken");
    token = await Token.deploy();
    await token.waitForDeployment();

    // 部署市场
    const PredictionMarket = await ethers.getContractFactory("PredictionMarket");
    market = await PredictionMarket.deploy(await token.getAddress());
    await market.waitForDeployment();

    // 给测试账户分发代币
    await token.faucet(addr1.address, ethers.parseEther("1000"));
    await token.faucet(addr2.address, ethers.parseEther("1000"));
  });

  it("应该能成功创建一个市场", async function () {
    await market.createMarket("测试问题", "测试描述", 3600);
    const m = await market.markets(1);
    expect(m.question).to.equal("测试问题");
  });

  it("用户应该能购买 YES 份额", async function () {
    await market.createMarket("测试问题", "测试描述", 3600);
    
    const amount = ethers.parseEther("100");
    await token.connect(addr1).approve(await market.getAddress(), amount);
    await market.connect(addr1).buyYes(1, amount);

    expect(await market.userYesShares(1, addr1.address)).to.equal(amount);
  });

  it("管理员应该能结算市场并让用户提取收益", async function () {
    await market.createMarket("测试问题", "测试描述", 1); // 1秒后结束
    
    const amount = ethers.parseEther("100");
    
    // 准备购买
    await token.connect(addr1).approve(await market.getAddress(), amount);
    await token.connect(addr2).approve(await market.getAddress(), amount);
    
    await market.connect(addr1).buyYes(1, amount);
    await market.connect(addr2).buyNo(1, amount);

    // 等待市场结束
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // 结算为 YES 赢
    await market.resolveMarket(1, true);

    // Addr1 提取收益 (应该获得全部池子，即 200)
    const initialBalance = await token.balanceOf(addr1.address);
    await market.connect(addr1).claimReward(1);
    const finalBalance = await token.balanceOf(addr1.address);

    expect(finalBalance - initialBalance).to.equal(ethers.parseEther("200"));
  });
});
