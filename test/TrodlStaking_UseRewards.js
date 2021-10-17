const Trodl = artifacts.require("Trodl");
const TrodlStake = artifacts.require("TrodlStake");
const TestRewardUser = artifacts.require("TestRewardUser");
const { BN, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { expect } = require('chai');

contract('TrodlStake UseReward Tests', function (accounts) {

    const [ owner, staker1] = accounts;

    const transferAmount1 = web3.utils.toWei('300','ether');
    const stakeAmount1 = web3.utils.toWei('100','ether');

    // let poolAddress;
    
    beforeEach(async function () {
        // Create Trodl token for test
        this.token = await Trodl.new();

        // Give some supply to the staker1
        await this.token.transfer(staker1, transferAmount1, {from: owner});
        
        // Create the Stake contract
        this.TrodlStake = await TrodlStake.new(this.token.address, 50, 14);

        // poolAddress = await this.TrodlStake.getTROStakingPool();
        // // await this.token.exemptAccount(poolAddress); // Old token behavior

        this.RewardUser = await TestRewardUser.new(this.TrodlStake.address);
    });

    describe("Testing for Reward useage", function() {
        it('Only REWARD_USER role can use XTRO rewards from contract', async function(){
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1})
            await this.TrodlStake.stake( stakeAmount1, {from: staker1});
            
            // Go forward by 3600s
            let currentTime = await time.latest();
            let activePeriod = currentTime.addn(3600);
            await time.increaseTo(activePeriod);

            let balance = await this.TrodlStake.getxTROBalance( staker1);
            console.log(balance.toString());

            // Addres is not yet permitted to use rewards hence reverts
            await expectRevert(this.RewardUser.useXTRO(web3.utils.toWei('2','ether'), {from: staker1}), "TrodlStake: Address cannot use rewards");
            
            balance = await this.TrodlStake.getxTROBalance( staker1);
            console.log(balance.toString());

            // Grant Reward User role to TEST contract (by default owner)
            await this.TrodlStake.grantRewardUserRole( this.RewardUser.address );
            
            // Use Rewards
            let response = await  this.RewardUser.useXTRO(web3.utils.toWei('2','ether'),{from: staker1});

            balance = await this.TrodlStake.getxTROBalance( staker1);
            console.log(balance.toString());
            
            let data = await this.TrodlStake.getUserRewardInfo( staker1)
            console.log(data);

            expectEvent.inLogs(response.logs, 'RewardsUsed', {
                user: staker1,
                amount : web3.utils.toWei('2','ether')
            });

            let balanceAfterUsage = await this.TrodlStake.getxTROBalance( staker1);
            console.log(balanceAfterUsage.toString());

            // Rewards were used wait for it to accumulate
            await expectRevert(this.RewardUser.useXTRO(web3.utils.toWei('3','ether'), {from: staker1}),"TrodlStake: Insufficient Rewards");

            // Go forward by 3600s
            currentTime = await time.latest();
            activePeriod = currentTime.addn(3600);
            await time.increaseTo(activePeriod);

            await this.RewardUser.useXTRO(web3.utils.toWei('2','ether'), {from: staker1});

            data = await this.TrodlStake.getUserRewardInfo( staker1)
            console.log(data);

            balanceAfterUsage = await this.TrodlStake.getxTROBalance( staker1);
            console.log(balanceAfterUsage.toString());
        });

        it('Withdraw all TRO and still use XTRO ', async function(){
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1})
            await this.TrodlStake.stake( stakeAmount1, {from: staker1});
            
            // Go forward by 3600s
            let currentTime = await time.latest();
            let activePeriod = currentTime.addn(3600);
            await time.increaseTo(activePeriod);

            await this.TrodlStake.unstakeAll({from: staker1});

            let balance = await this.TrodlStake.getxTROBalance( staker1);
            console.log(balance.toString());

            // Grant Reward User role to TEST contract (by default owner)
            await this.TrodlStake.grantRewardUserRole( this.RewardUser.address );
            
            // Use Rewards
            await this.RewardUser.useXTRO(web3.utils.toWei('2','ether'),{from: staker1});

            balance = await this.TrodlStake.getxTROBalance( staker1);
            console.log(balance.toString());
            
            let data = await this.TrodlStake.getUserRewardInfo( staker1)
            console.log(data);

            // Go forward by 14 days
            currentTime = await time.latest();
            activePeriod = currentTime.addn(14 * 86400);
            await time.increaseTo(activePeriod);

            let balanceAfterUsage = await this.TrodlStake.getxTROBalance( staker1);
            console.log(balanceAfterUsage.toString());

            // Rewards were used wait for it to accumulate
            await expectRevert(this.RewardUser.useXTRO(web3.utils.toWei('2','ether'), {from: staker1}),"TrodlStake: Insufficient Rewards");

            data = await this.TrodlStake.getUserRewardInfo( staker1)
            console.log(data);
        });
    });
});

