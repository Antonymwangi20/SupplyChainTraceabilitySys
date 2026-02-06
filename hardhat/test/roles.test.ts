import {expect} from "chai";
import {ethers} from "hardhat";

describe("SupplyChain - roles", function () {
  it("allows admin to grant roles and blocks non-admin", async function () {
    const [admin, manufacturer, attacker] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    const MANUFACTURER = await sc.MANUFACTURER();

    await expect(sc.connect(attacker).grantRoleSafe(MANUFACTURER, manufacturer.address)).to.be.reverted;

    await expect(sc.connect(admin).grantRoleSafe(MANUFACTURER, manufacturer.address)).to.not.be.reverted;
    expect(await sc.hasRole(MANUFACTURER, manufacturer.address)).to.equal(true);
  });
});