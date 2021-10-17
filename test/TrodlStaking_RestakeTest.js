const Trodl = artifacts.require("Trodl");
const TrodlStake = artifacts.require("TrodlStake");
const { expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { expect } = require('chai');

contract('TrodlStake reStake Tests', function (accounts) {

    const [ owner, staker1, staker2 ] = accounts;

    const transferAmount1 = web3.utils.toWei('300','ether');
    const stakeAmount1 = web3.utils.toWei('100','ether');
    const actualStakeAmount1 = web3.utils.toWei('99','ether');

    // let poolAddress;
    
    beforeEach(async function () {
        // Create Trodl token for test
        this.token = await Trodl.new();

        // Give some supply to the staker1
        await this.token.transfer(staker1, transferAmount1, {from: owner});
        
        // Create the Stake contract
        this.TrodlStake = await TrodlStake.new(this.token.address, 50, 14);

        // poolAddress = await this.TrodlStake.getTROStakingPool();
        // await this.token.exemptAccount(poolAddress); // Old token behavior
    });

    describe("Staker1 unstakes TRO and checks for XTRO", function(){
        it('it is possible to reStake them back', async function(){
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1})
            await this.TrodlStake.stake( stakeAmount1, {from: staker1});
            
            // Go forward by 100s
            let currentTime = await time.latest();
            let activePeriod = currentTime.addn(100);
            await time.increaseTo(activePeriod);

            // Unstake
            await this.TrodlStake.unstakeAll({from: staker1});
            
            let data = await this.TrodlStake.getUserRewardInfo( staker1)
            console.log(data);
            testRewardInfoWithValues2('0','100000000000000000000','0',data);

            // Go forward by 100s
            currentTime = await time.latest();
            activePeriod = currentTime.addn(100);
            await time.increaseTo(activePeriod);

            // Withdraw before 14 days reverts
            let response = await  this.TrodlStake.reStake({from: staker1});

            expectEvent.inLogs(response.logs, 'ReStake', {
                user: staker1,
                amount : stakeAmount1,
                total : stakeAmount1,
            });

            data = await this.TrodlStake.getUserRewardInfo( staker1)
            // console.log(data);
            testRewardInfoWithValues2('100000000000000000000','0','0',data);
        });

        it('it is possible to reStake with previous staked balance', async function(){
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1})
            await this.TrodlStake.stake( stakeAmount1, {from: staker1});

            let currentTime = await time.latest();
            let activePeriod = currentTime.addn(100);
            await time.increaseTo(activePeriod);
            
            let response = await this.TrodlStake.unstake(web3.utils.toWei('49.5','ether'),{from: staker1});
            
            expectEvent.inLogs(response.logs, 'Unstaked', {
                user: staker1,
                amount : web3.utils.toWei('49.5','ether'),
                total : web3.utils.toWei('50.5','ether'),
            });

            response = await  this.TrodlStake.reStake({from: staker1});

            expectEvent.inLogs(response.logs, 'ReStake', {
                user: staker1,
                amount : web3.utils.toWei('49.5','ether'),
                total : stakeAmount1,
            });

            let data = await this.TrodlStake.getUserRewardInfo( staker1)
            console.log(data);
            testRewardInfoWithValues2('100000000000000000000','0','0',data);

        });
    });

    testRewardInfoWithValues2 = (stakeAmount, unstakeAmount, rewardsUsed, actualData ) => {
        expect(actualData[0]).to.be.equal(stakeAmount);
        expect(actualData[1]).to.be.equal(unstakeAmount);
        expect(actualData[3]).to.be.equal(rewardsUsed);
    }
});

