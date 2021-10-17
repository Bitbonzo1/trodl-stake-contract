// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.9;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./TokenPool.sol";

contract TrodlStake is ReentrancyGuard, AccessControl {
    using SafeMath for uint256;

    event Staked(address indexed user, uint256 amount, uint256 total);
    event Unstaked(address indexed user, uint256 amount, uint256 total);
    event Withdraw(address indexed user, uint256 amount, uint256 total);
    event ReStake(address indexed user, uint256 amount, uint256 total);
    event RewardUsed(address indexed user, uint256 amount);

    bytes32 REWARD_USER = keccak256(bytes("REWARD_USER"));
    uint256 public _apy; // annual percentage yield
    uint256 public _lockupPeriod; // Lock Up period in days

    TokenPool private _troStakingPool;

    struct UserRewardInfo {
        uint256 stakedAmount;
        uint256 unstakedAmount;
        uint256 rewardMinted;
        uint256 rewardUsed;
        uint256 lastAccountingTimestampSec;
    }

    mapping(address => UserRewardInfo) private _userRewards;

    address[] private _stakers;

    constructor(
        IERC20 token,
        uint256 apy,
        uint256 lockupPeriod
    ) {
        _apy = apy;
        _lockupPeriod = lockupPeriod;
        _troStakingPool = new TokenPool(token);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // To grant IDO to REWARD_USER role later on
    }

    function stake(uint256 amount) public nonReentrant {
        require(amount > 0, "TrodlStake: stake amount ZERO");

        UserRewardInfo memory userRewardInfo = _userRewards[msg.sender];

        uint256 actualTransferAmount = _getTransactionAmount(amount);

        bool mathStatus;

        if (userRewardInfo.lastAccountingTimestampSec == 0) {
            _stakers.push(msg.sender);
        }
        if (userRewardInfo.lastAccountingTimestampSec != 0) {
            //calculate applicable rewards so far and add it
            uint256 rewardsUntilNow = calculateReward(userRewardInfo);

            (mathStatus, userRewardInfo.rewardMinted) = userRewardInfo
                .rewardMinted
                .tryAdd(rewardsUntilNow);
            require(mathStatus == true, "TrodlStake: Math Error");
        }

        (mathStatus, userRewardInfo.stakedAmount) = userRewardInfo
            .stakedAmount
            .tryAdd(actualTransferAmount);
        require(mathStatus == true, "TrodlStake: Math Error");

        userRewardInfo.lastAccountingTimestampSec = block.timestamp;
        _userRewards[msg.sender] = userRewardInfo;

        try
            _troStakingPool.token().transferFrom(
                msg.sender,
                address(_troStakingPool),
                amount
            )
        returns (bool) {
            emit Staked(
                msg.sender,
                actualTransferAmount,
                userRewardInfo.stakedAmount
            );
        } catch Error(string memory) {
            revert("TrodlStake: Failed transfer to staking pool");
        } catch (bytes memory) {
            // This is executed in case revert() was used.
            revert("TrodlStake: Failed transfer to staking pool");
        }
    }

    function unstakeAll() public {
        unstake(_userRewards[msg.sender].stakedAmount);
    }

    function unstake(uint256 amount) public nonReentrant {
        require(amount > 0, "TrodlStake: Require Non Zero Value");

        UserRewardInfo storage userRewardInfo = _userRewards[msg.sender];
        // require(userRewardInfo.stakedAmount > 0, "TrodlStake: No Staked TRO");
        require(
            amount <= userRewardInfo.stakedAmount,
            "TrodlStake: Not enough Staked TRO"
        );

        bool mathStatus;
        uint256 rewardsUntilNow = calculateReward(userRewardInfo);

        (mathStatus, userRewardInfo.rewardMinted) = userRewardInfo
            .rewardMinted
            .tryAdd(rewardsUntilNow);
        require(mathStatus == true, "TrodlStake: Math Error");

        (mathStatus, userRewardInfo.stakedAmount) = userRewardInfo
            .stakedAmount
            .trySub(amount);
        require(mathStatus == true, "TrodlStake: Math Error");

        (mathStatus, userRewardInfo.unstakedAmount) = userRewardInfo
            .unstakedAmount
            .tryAdd(amount);
        require(mathStatus == true, "TrodlStake: Math Error");

        userRewardInfo.lastAccountingTimestampSec = block.timestamp;

        emit Unstaked(msg.sender, amount, userRewardInfo.stakedAmount);
    }

    function withdrawAllTRO() public {
        return withdrawTRO(_userRewards[msg.sender].unstakedAmount);
    }

    function withdrawTRO(uint256 amount) public nonReentrant {
        require(amount > 0, "TrodlStake: Require Non Zero Value");

        UserRewardInfo storage userRewardInfo = _userRewards[msg.sender];

        require(
            amount <= userRewardInfo.unstakedAmount,
            "TrodlStake: Not enough Un-Staked TRO"
        );

        require(
            block.timestamp >=
                (userRewardInfo.lastAccountingTimestampSec +
                    (_lockupPeriod * 1 days)),
            "TrodlStake: Withdraw in LockPeriod"
        );

        bool mathStatus;
        if (userRewardInfo.stakedAmount > 0) {
            uint256 rewardsUntilNow = calculateReward(userRewardInfo);

            (mathStatus, userRewardInfo.rewardMinted) = userRewardInfo
                .rewardMinted
                .tryAdd(rewardsUntilNow);
            require(mathStatus == true, "TrodlStake: Math Error");
        }

        (mathStatus, userRewardInfo.unstakedAmount) = userRewardInfo
            .unstakedAmount
            .trySub(amount);
        require(mathStatus == true, "TrodlStake: Math Error");

        userRewardInfo.lastAccountingTimestampSec = block.timestamp;

        try _troStakingPool.transfer(msg.sender, amount) returns (bool) {
            uint256 actualTransferAmount = _getTransactionAmount(amount);
            emit Withdraw(
                msg.sender,
                actualTransferAmount,
                userRewardInfo.stakedAmount
            );
        } catch Error(string memory) {
            revert("TrodlStake: Transfer Error from Pool");
        } catch (bytes memory) {
            revert("TrodlStake: Transfer Error from Pool");
        }
    }

    function reStake() public nonReentrant {
        UserRewardInfo storage userRewardInfo = _userRewards[msg.sender];

        uint256 restakeAmount = userRewardInfo.unstakedAmount;

        bool mathStatus;

        //calculate applicable rewards so far and add it
        if (userRewardInfo.stakedAmount > 0) {
            uint256 rewardsUntilNow = calculateReward(userRewardInfo);

            (mathStatus, userRewardInfo.rewardMinted) = userRewardInfo
                .rewardMinted
                .tryAdd(rewardsUntilNow);
            require(mathStatus == true, "TrodlStake: Math Error");
        }

        (mathStatus, userRewardInfo.stakedAmount) = userRewardInfo
            .stakedAmount
            .tryAdd(userRewardInfo.unstakedAmount);
        require(mathStatus == true, "TrodlStake: Math Error");

        userRewardInfo.unstakedAmount = 0;
        userRewardInfo.lastAccountingTimestampSec = block.timestamp;

        emit ReStake(msg.sender, restakeAmount, userRewardInfo.stakedAmount);
        restakeAmount = 0;
    }

    function usexTRO(uint256 amount, address user) public {
        require(
            hasRole(REWARD_USER, msg.sender),
            "TrodlStake: Address cannot use rewards"
        );

        UserRewardInfo storage userRewardInfo = _userRewards[user];

        bool mathStatus;
        if (userRewardInfo.stakedAmount > 0) {
            //calculate applicable rewards so far and add it
            uint256 rewardsUntilNow = calculateReward(userRewardInfo);

            (mathStatus, userRewardInfo.rewardMinted) = userRewardInfo
                .rewardMinted
                .tryAdd(rewardsUntilNow);

            require(mathStatus == true, "TrodlStake: Math Error");
        }

        uint256 usableRewards;
        (mathStatus, usableRewards) = userRewardInfo.rewardMinted.trySub(
            userRewardInfo.rewardUsed
        );

        require(amount <= usableRewards, "TrodlStake: Insufficient Rewards");

        (mathStatus, userRewardInfo.rewardUsed) = userRewardInfo
            .rewardUsed
            .tryAdd(amount);

        userRewardInfo.lastAccountingTimestampSec = block.timestamp;

        emit RewardUsed(msg.sender, amount);
    }

    function grantRewardUserRole(address rewardUser) public {
        grantRole(REWARD_USER, rewardUser);
    }

    function revokeRewardUserRole(address rewardUser) public {
        revokeRole(REWARD_USER, rewardUser);
    }

    function _getTransactionAmount(uint256 amount)
        private
        pure
        returns (uint256)
    {
        uint256 tokFeeHalf = amount.div(200);
        uint256 tFee = tokFeeHalf.mul(2);
        uint256 tokTransferAmount = amount.sub(tFee);
        return tokTransferAmount;
    }

    function calculateReward(UserRewardInfo memory userRewardInfo)
        private
        view
        returns (uint256)
    {
        uint256 currentRewards = userRewardInfo.stakedAmount.mul(_apy).mul(
            block.timestamp.sub(userRewardInfo.lastAccountingTimestampSec)
        );

        return currentRewards.div(8640000);
    }

    function getxTROBalance(address user) public view returns (uint256) {
        UserRewardInfo memory userRewardInfo = _userRewards[user];
        uint256 currentRewards = calculateReward(userRewardInfo);

        bool mathStatus;

        uint256 balance = userRewardInfo.rewardMinted.add(currentRewards);
        (mathStatus, balance) = balance.trySub(userRewardInfo.rewardUsed);

        return balance;
    }

    function getTotalxTRO() public view returns (uint256) {
        uint256 balance;
        for (uint256 i = 0; i < _stakers.length; i++) {
            balance = balance.add(getxTROBalance(_stakers[i])).add(
                _userRewards[_stakers[i]].rewardUsed
            );
        }
        return balance;
    }

    function getStakedTROBalance() public view returns (uint256) {
        return _userRewards[msg.sender].stakedAmount;
    }

    function getUnstakedTROBalance() public view returns (uint256) {
        return _userRewards[msg.sender].unstakedAmount;
    }

    function getTotalTROStaked() public view returns (uint256) {
        return _troStakingPool.balance();
    }

    function getTROStakingPool() public view returns (address) {
        return address(_troStakingPool);
    }

    function getAllStakers() public view returns (address[] memory) {
        return _stakers;
    }

    function getUserRewardInfo(address user)
        public
        view
        returns (UserRewardInfo memory info)
    {
        return _userRewards[user];
    }
}
