const Trodl = artifacts.require("Trodl");
const TrodlStake = artifacts.require("TrodlStake");
const { BN, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

contract('TrodlStake Unstake Tests', function (accounts) {

    const [ owner, staker1, staker2 ] = accounts;

    const transferAmount1 = web3.utils.toWei('200','ether');
    const stakeAmount1 = web3.utils.toWei('100','ether');
    
    beforeEach(async function () {
        // Create Trodl token for test
        this.token = await Trodl.new();

        // Give some supply to the staker1
        await this.token.transfer(staker1, transferAmount1, {from: owner});
        
        // Create the Stake contract
        this.TrodlStake = await TrodlStake.new(this.token.address, 50, 14);

        // let poolAddress = await this.TrodlStake.getTROStakingPool();
        // await this.token.exemptAccount(poolAddress); // Old token behavior
    });

    describe("Staker1 unstakes TRO and checks for XTRO", function(){
        it('is possible to get XTRO for that stake period', async function(){
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1})
            await this.TrodlStake.stake( stakeAmount1, {from: staker1});

            expect(await this.TrodlStake.getStakedTROBalance({from: staker1})).to.be.bignumber.equal(stakeAmount1);
            
            let currentTime = await time.latest();
            let activePeriod = currentTime.addn(100);
            await time.increaseTo(activePeriod);

            let response = await this.TrodlStake.unstakeAll({from: staker1});

            expectEvent.inLogs(response.logs, 'Unstaked', {
                user: staker1,
                amount : stakeAmount1,
                total : new BN('0'),
            });

            let XTRORewarded = await this.TrodlStake.getxTROBalance( staker1);

            let data = await this.TrodlStake.getUserRewardInfo( staker1)
            testRewardInfoWithValues1('0','100000000000000000000','0',data);

            // No change in rewards earned after unstaked even after time passes on
            currentTime = await time.latest();
            activePeriod = currentTime.addn(100);
            await time.increaseTo(activePeriod);

            expect( await this.TrodlStake.getxTROBalance( staker1)).to.be.bignumber.equal(XTRORewarded);

            // Trying to unstake all again with no TRO remaining reverts
            await expectRevert( this.TrodlStake.unstakeAll({from: staker1}),'TrodlStake: Require Non Zero Value');
        });
    
        it('it is not possible to unstake from a non staker', async function(){
            await expectRevert( this.TrodlStake.unstakeAll({from: staker2}),'TrodlStake: Require Non Zero Value');
        });

        it(' is not possible to unstake for more than staked amount', async function(){
            await expectRevert( this.TrodlStake.unstake(1 ,{from: staker2}),'TrodlStake: Not enough Staked TRO');
        });

        it('is not possible to unstake with zero amount', async function(){
            await expectRevert( this.TrodlStake.unstake(0,{from: staker1}),'TrodlStake: Require Non Zero Value');
        });

        it('is possible to unstake in parts', async function(){
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1})
            await this.TrodlStake.stake( stakeAmount1, {from: staker1});

            let currentTime = await time.latest();
            let activePeriod = currentTime.addn(100);
            await time.increaseTo(activePeriod);
            
            let halfOfStakeAmount = web3.utils.toWei('50','ether');
            let response = await this.TrodlStake.unstake(halfOfStakeAmount,{from: staker1});
            
            expectEvent.inLogs(response.logs, 'Unstaked', {
                user: staker1,
                amount : halfOfStakeAmount,
                total : halfOfStakeAmount,
            });

            expect(await this.TrodlStake.getStakedTROBalance({from: staker1})).to.be.bignumber.equal(halfOfStakeAmount);

            let XTRORewarded = await this.TrodlStake.getxTROBalance( staker1);
            console.log(XTRORewarded.toString());

            let data = await this.TrodlStake.getUserRewardInfo( staker1)
            // console.log(data);
            testRewardInfoWithValues1('50000000000000000000','50000000000000000000','0',data);

            // unstake another amount
            currentTime = await time.latest();
            activePeriod = currentTime.addn(100);
            await time.increaseTo(activePeriod);

            XTRORewarded = await this.TrodlStake.getxTROBalance( staker1);
            console.log(XTRORewarded.toString());

            response = await this.TrodlStake.unstake(web3.utils.toWei('40','ether'),{from: staker1});
            
            expectEvent.inLogs(response.logs, 'Unstaked', {
                user: staker1,
                amount : web3.utils.toWei('40','ether'),
                total : web3.utils.toWei('10','ether'),
            });

            data = await this.TrodlStake.getUserRewardInfo( staker1)
            // console.log(data);
            testRewardInfoWithValues1('10000000000000000000','90000000000000000000','0',data);
        });
    });

    testRewardInfoWithValues1 = (stakeAmount, unstakeAmount, rewardsUsed, actualData ) => {
        expect(stakeAmount).to.be.equal(actualData[0]);
        expect(unstakeAmount).to.be.equal(actualData[1]);
        expect(rewardsUsed).to.be.equal(actualData[3]);
    }
});

