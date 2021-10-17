const Trodl = artifacts.require("Trodl");
const TrodlStake = artifacts.require("TrodlStake");
const { BN, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { expect } = require('chai');

contract('TrodlStake Withdraw Tests', function (accounts) {

    const [ owner, staker1, staker2 ] = accounts;

    const transferAmount1 = web3.utils.toWei('300','ether');
    const stakeAmount1 = web3.utils.toWei('100','ether');
    
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

    describe("Staker1 withdraws TRO and checks for XTRO", function(){
        it('is possible to withdraw them back', async function(){
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1})
            await this.TrodlStake.stake( stakeAmount1, {from: staker1});
            
            // Go forward by 100s
            let currentTime = await time.latest();
            let activePeriod = currentTime.addn(100);
            await time.increaseTo(activePeriod);

            // Unstake
            await this.TrodlStake.unstakeAll({from: staker1});

            // Go forward by 100s
            currentTime = await time.latest();
            activePeriod = currentTime.addn(100);
            await time.increaseTo(activePeriod);

            // Withdraw before 14 days reverts
            await expectRevert( this.TrodlStake.withdrawAllTRO({from: staker1}),'TrodlStake: Withdraw in LockPeriod');

            // Go forward by 100s
            currentTime = await time.latest();
            activePeriod = currentTime.addn(14 * 86400);
            await time.increaseTo(activePeriod);

            expect(await this.token.balanceOf(staker1)).to.be.bignumber.equal(web3.utils.toWei('200','ether'));

            let response = await this.TrodlStake.withdrawAllTRO({from: staker1});

            expectEvent.inLogs(response.logs, 'Withdraw', {
                user: staker1,
                amount : stakeAmount1,
                total : new BN('0'),
            });

            expect(await this.token.balanceOf(staker1)).to.be.bignumber.equal(web3.utils.toWei('300','ether'));
        });
    
        it('is not possible to withdraw from a non staker', async function(){
            await expectRevert( this.TrodlStake.withdrawAllTRO({from: staker2}),'TrodlStake: Require Non Zero Value');
        });

        it('is not possible to withdraw for more than staked amount', async function(){
            await expectRevert( this.TrodlStake.withdrawTRO(1 ,{from: staker2}),'TrodlStake: Not enough Un-Staked TRO');
        });

        it('is not possible to withdraw with zero unstaked amount', async function(){
            await expectRevert( this.TrodlStake.unstake(0,{from: staker1}),'TrodlStake: Require Non Zero Value');
        });

        it('is possible to unstake and withdraw in parts', async function(){
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

            expect(await this.TrodlStake.getStakedTROBalance({from: staker1})).to.be.bignumber.equal(web3.utils.toWei('50.5','ether'));

            let data = await this.TrodlStake.getUserRewardInfo( staker1)
            // console.log(data);
            testRewardInfoWithValues2('50500000000000000000','49500000000000000000','0',data);

            // Go foward in time to withdraw TRO
            currentTime = await time.latest();
            activePeriod = currentTime.addn(14 * 86400);
            await time.increaseTo(activePeriod);

            response = await this.TrodlStake.withdrawTRO(web3.utils.toWei('40','ether'),{from: staker1});
            expectEvent.inLogs(response.logs, 'Withdraw', {
                user: staker1,
                amount : web3.utils.toWei('40','ether'),
                total : web3.utils.toWei('50.5','ether'),
            });

            data = await this.TrodlStake.getUserRewardInfo( staker1)
            // console.log(data);
            testRewardInfoWithValues2('50500000000000000000','9500000000000000000','0',data);

            response = await this.TrodlStake.unstake(web3.utils.toWei('50.5','ether'),{from: staker1});
            
            expectEvent.inLogs(response.logs, 'Unstaked', {
                user: staker1,
                amount : web3.utils.toWei('50.5','ether'),
                total : new BN('0'),
            });

            // unstake remaining
            currentTime = await time.latest();
            activePeriod = currentTime.addn(14 * 86400);
            await time.increaseTo(activePeriod);

            data = await this.TrodlStake.getUserRewardInfo( staker1)
            // console.log(data);
            testRewardInfoWithValues2('0','60000000000000000000','0',data);

            await this.TrodlStake.withdrawAllTRO({from: staker1});

            data = await this.TrodlStake.getUserRewardInfo( staker1)
            // console.log(data);
            testRewardInfoWithValues2('0','0','0',data);

        });
    });

    testRewardInfoWithValues2 = (stakeAmount, unstakeAmount, rewardsUsed, actualData ) => {
        expect(actualData[0]).to.be.equal(stakeAmount);
        expect(actualData[1]).to.be.equal(unstakeAmount);
        expect(actualData[3]).to.be.equal(rewardsUsed);
    }
});

