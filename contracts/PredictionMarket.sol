// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PredictionMarket
 * @dev 一个去中心化的 YES/NO 预测市场合约
 */
contract PredictionMarket is Ownable, ReentrancyGuard {
    struct Market {
        uint256 id;
        string question;
        string description;
        uint256 endTime;
        bool resolved;
        bool outcome; // true 为 YES, false 为 NO
        uint256 totalYesShares;
        uint256 totalNoShares;
    }

    IERC20 public bettingToken;
    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    
    // 用户持仓: marketId => userAddress => shares
    mapping(uint256 => mapping(address => uint256)) public userYesShares;
    mapping(uint256 => mapping(address => uint256)) public userNoShares;

    event MarketCreated(uint256 indexed id, string question, string description, uint256 endTime);
    event SharesPurchased(uint256 indexed id, address indexed user, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed id, bool outcome);
    event RewardClaimed(uint256 indexed id, address indexed user, uint256 amount);

    constructor(address _bettingToken) Ownable(msg.sender) {
        bettingToken = IERC20(_bettingToken);
    }

    /**
     * @dev 1. 创建市场
     * @param _question 预测问题
     * @param _description 详细描述
     * @param _duration 市场持续时间（秒）
     */
    function createMarket(string memory _question, string memory _description, uint256 _duration) external {
        marketCount++;
        uint256 marketId = marketCount;
        
        Market storage m = markets[marketId];
        m.id = marketId;
        m.question = _question;
        m.description = _description;
        m.endTime = block.timestamp + _duration;
        m.resolved = false;

        emit MarketCreated(marketId, _question, _description, m.endTime);
    }

    /**
     * @dev 2. 购买 YES 份额
     */
    function buyYes(uint256 _marketId, uint256 _amount) external nonReentrant {
        Market storage market = markets[_marketId];
        require(block.timestamp < market.endTime, "Market has ended");
        require(!market.resolved, "Market already resolved");
        require(_amount > 0, "Amount must be > 0");

        bettingToken.transferFrom(msg.sender, address(this), _amount);
        
        userYesShares[_marketId][msg.sender] += _amount;
        market.totalYesShares += _amount;

        emit SharesPurchased(_marketId, msg.sender, true, _amount);
    }

    /**
     * @dev 3. 购买 NO 份额
     */
    function buyNo(uint256 _marketId, uint256 _amount) external nonReentrant {
        Market storage market = markets[_marketId];
        require(block.timestamp < market.endTime, "Market has ended");
        require(!market.resolved, "Market already resolved");
        require(_amount > 0, "Amount must be > 0");

        bettingToken.transferFrom(msg.sender, address(this), _amount);
        
        userNoShares[_marketId][msg.sender] += _amount;
        market.totalNoShares += _amount;

        emit SharesPurchased(_marketId, msg.sender, false, _amount);
    }

    /**
     * @dev 5. 市场结算 (仅限管理员)
     * @param _outcome 最终结果: true 为 YES, false 为 NO
     */
    function resolveMarket(uint256 _marketId, bool _outcome) external onlyOwner {
        Market storage market = markets[_marketId];
        require(block.timestamp >= market.endTime, "Market not yet ended");
        require(!market.resolved, "Market already resolved");

        market.resolved = true;
        market.outcome = _outcome;

        emit MarketResolved(_marketId, _outcome);
    }

    /**
     * @dev 6. 提取收益
     * 规则：获胜方按比例瓜分总资金池
     */
    function claimReward(uint256 _marketId) external nonReentrant {
        Market storage market = markets[_marketId];
        require(market.resolved, "Market not resolved yet");

        uint256 reward = 0;
        uint256 totalPool = market.totalYesShares + market.totalNoShares;

        if (market.outcome) {
            // YES 获胜
            uint256 userShares = userYesShares[_marketId][msg.sender];
            require(userShares > 0, "No winning shares");
            
            reward = (userShares * totalPool) / market.totalYesShares;
            userYesShares[_marketId][msg.sender] = 0;
        } else {
            // NO 获胜
            uint256 userShares = userNoShares[_marketId][msg.sender];
            require(userShares > 0, "No winning shares");
            
            reward = (userShares * totalPool) / market.totalNoShares;
            userNoShares[_marketId][msg.sender] = 0;
        }

        require(reward > 0, "Reward amount is zero");
        bettingToken.transfer(msg.sender, reward);

        emit RewardClaimed(_marketId, msg.sender, reward);
    }

    /**
     * @dev 获取所有市场列表
     */
    function getAllMarkets() external view returns (Market[] memory) {
        Market[] memory allMarkets = new Market[](marketCount);
        for (uint256 i = 1; i <= marketCount; i++) {
            allMarkets[i - 1] = markets[i];
        }
        return allMarkets;
    }

    /**
     * @dev 4. 查看市场详情
     */
    function getMarket(uint256 _marketId) external view returns (
        string memory question,
        string memory description,
        uint256 endTime,
        bool resolved,
        bool outcome,
        uint256 totalYes,
        uint256 totalNo
    ) {
        Market storage m = markets[_marketId];
        return (m.question, m.description, m.endTime, m.resolved, m.outcome, m.totalYesShares, m.totalNoShares);
    }
}
