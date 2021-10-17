const Trodl = artifacts.require("Trodl");
const TrodlStake = artifacts.require("TrodlStake");
const { BN, constants, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { ZERO_ADDRESS } = constants;

contract('TrodlStake Stake Tests', function (accounts) {

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

        // let poolAddress = await this.TrodlStake.getTROStakingPool();
        // await this.token.exemptAccount(poolAddress); // Old token behavior
    });

    describe("Staker1 stakes TRO and checks for XTRO", function(){
        it('is possible to get XTRO', async function(){
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1})
            let response = await this.TrodlStake.stake( stakeAmount1, {from: staker1});
        
            expectEvent.inLogs(response.logs, 'Staked', {
                user: staker1,
                amount : stakeAmount1,
                total : stakeAmount1,
            });

            expect(await this.TrodlStake.getStakedTROBalance({from: staker1})).to.be.bignumber.equal(stakeAmount1);
            
            //Since only one user, both user and pool balance shall be same
            expect(await this.TrodlStake.getStakedTROBalance({from: staker1})).to.be.bignumber.equal(await this.TrodlStake.getTotalTROStaked({from: staker1}));

            let currentTime = await time.latest();
            let activePeriod = currentTime.addn(86400); // active period: 1 day == 86400 seconds
            await time.increaseTo(activePeriod);

            //Since only one user, both user and total rewards shall be same
            expect(await this.TrodlStake.getxTROBalance( staker1)).to.be.bignumber.equal(await this.TrodlStake.getxTROBalance( staker1));

            let data = await this.TrodlStake.getUserRewardInfo( staker1)
            testRewardInfoWithValues('100000000000000000000','0','0','0',data);
        });
    
        it('is not possible to stake TRO without Token approval', async function(){
            // Token stake not approved
            await expectRevert( this.TrodlStake.stake( stakeAmount1, {from: staker1}),'TrodlStake: Failed transfer to staking pool');
        });

        it('is not possible to stake TRO without enough balance', async function(){
            let testValue = web3.utils.toWei('400','ether');
            await this.token.approve(this.TrodlStake.address, testValue, {from: staker1})
            await expectRevert( this.TrodlStake.stake( testValue, {from: staker1}),'TrodlStake: Failed transfer to staking pool');
        });

        it('staking TRO again is possible with updated values', async function(){
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1});
            let response = await this.TrodlStake.stake( stakeAmount1, {from: staker1});
            
            expectEvent.inLogs(response.logs, 'Staked', {
                user: staker1,
                amount : stakeAmount1,
                total : stakeAmount1,
            });

            let amountAfterSecondStaking = web3.utils.toWei('200','ether');
            await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1});
            response = await this.TrodlStake.stake( stakeAmount1, {from: staker1});
        
            expectEvent.inLogs(response.logs, 'Staked', {
                user: staker1,
                amount : stakeAmount1,
                total : amountAfterSecondStaking,
            });

            expect(await this.TrodlStake.getStakedTROBalance({from: staker1})).to.be.bignumber.equal(amountAfterSecondStaking);

            let currentTime = await time.latest();
            let activePeriod = currentTime.addn(86400); // active period: 1 day == 86400 seconds
            await time.increaseTo(activePeriod);

            console.log('Below value should be approximately twice the above value')
            let num = await this.TrodlStake.getxTROBalance( staker1);
            console.log(num.toString());

            currentTime = await time.latest();
            activePeriod = currentTime.addn(86400); // active period: 1 day == 86400 seconds
            await time.increaseTo(activePeriod);

            num = await this.TrodlStake.getxTROBalance( staker1);
            console.log(num.toString());

            let stakers = await this.TrodlStake.getAllStakers();
            expect(stakers.length).to.be.equal(1);
            expect(stakers[0]).to.be.equal(staker1);
        });

        describe("Multiple Stakers can stake TRO and checks for XTRO", function(){
            it('it is possible to get XTRO', async function(){

                const stakeAmount2 = web3.utils.toWei('100','ether');
                // Give some supply to the project creators
                await this.token.transfer(staker2, stakeAmount2, {from: owner});

                await this.token.approve(this.TrodlStake.address, stakeAmount1, {from: staker1})
                await this.token.approve(this.TrodlStake.address, stakeAmount2, {from: staker2})

                await this.TrodlStake.stake( stakeAmount1, {from: staker1});

                // Add a five second delay b/w stakes to check the values are not same
                let currentTime = await time.latest();
                let activePeriod = currentTime.addn(5); // active period: 1 day == 86400 seconds
                await time.increaseTo(activePeriod);

                await this.TrodlStake.stake( stakeAmount2, {from: staker2});

                expect(await this.TrodlStake.getStakedTROBalance({from: staker1})).to.be.bignumber.equal(stakeAmount1);
                expect(await this.TrodlStake.getStakedTROBalance({from: staker2})).to.be.bignumber.equal(stakeAmount2);
                
                currentTime = await time.latest();
                activePeriod = currentTime.addn(86400); // active period: 1 day == 86400 seconds
                await time.increaseTo(activePeriod);

                console.log('Below two values should be slightly different from each other');
                let staker1rewards = await this.TrodlStake.getxTROBalance( staker1);
                console.log(staker1rewards.toString());

                let staker2rewards = await this.TrodlStake.getxTROBalance( staker2);
                console.log(staker2rewards.toString());

                console.log('Below value is the sum of two value from above');
                let totalBalance = await this.TrodlStake.getTotalxTRO({from: staker1});
                console.log(totalBalance.toString());

                let stakers = await this.TrodlStake.getAllStakers();
                expect(stakers.length).to.be.equal(2);
                expect(stakers[0]).to.be.equal(staker1);
                expect(stakers[1]).to.be.equal(staker2);
            });
        });
    });

    testRewardInfoWithValues = (stakeAmount, unstakeAmount, rewardsAvailable, rewardsUsed, actualData ) => {
        expect(stakeAmount).to.be.equal(actualData[0]);
        expect(unstakeAmount).to.be.equal(actualData[1]);
        expect(rewardsAvailable).to.be.equal(actualData[2]);
        expect(rewardsUsed).to.be.equal(actualData[3]);
    }
});

