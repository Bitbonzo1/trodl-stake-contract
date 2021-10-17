// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IStake {
    function stake(uint256 amount) external;

    function getxTROBalance(address user) external view returns (uint256);

    function getStakedTROBalance() external view returns (uint256);

    function getUnstakedTROBalance() external view returns (uint256);

    function getTotalTROStaked() external view returns (uint256);

    function getTROStakingPool() external view returns (address);

    function unstakeAll() external;

    function unstake(uint256 amount) external;

    function withdrawAllTRO() external;

    function withdrawTRO(uint256 amount) external;

    function reStake() external;

    function usexTRO(uint256 amount, address user) external;

    function getAllStakers() external view returns (address[] memory);
}

contract TestRewardUser {
    IStake _stakepool;

    constructor(IStake stakepool) {
        _stakepool = stakepool;
    }

    event RewardsUsed(address indexed user, uint256 amount);

    function useXTRO(uint256 amount) public {
        _stakepool.usexTRO(amount, msg.sender);
        emit RewardsUsed(msg.sender, amount);
    }
}
