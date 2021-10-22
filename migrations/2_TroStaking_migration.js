const truffleConfig = require("../truffle-config");

const Trodl = artifacts.require("Trodl");
const TrodlStake = artifacts.require("TrodlStake");

module.exports = async function (deployer) {
  await deployer.deploy(Trodl);
  let trodl = await Trodl.deployed();
  await deployer.deploy(TrodlStake,trodl.address, 40, 1);
};



