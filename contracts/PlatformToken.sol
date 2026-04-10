// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title PlatformToken
 * @dev 预测市场使用的基础代币 (PMT)
 */
contract PlatformToken is ERC20 {
    constructor() ERC20("Prediction Market Token", "PMT") {
        // 初始铸造 100万 代币给部署者
        _mint(msg.sender, 1000000 * 10**decimals());
    }

    /**
     * @dev 测试用水龙头，允许任何人领取 100 个代币
     */
    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
