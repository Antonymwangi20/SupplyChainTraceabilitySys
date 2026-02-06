import {expect} from "chai";
import {ethers} from "hardhat";

describe("SupplyChain - batches", function () {
  it("requires native stake and enforces mint cap", async function () {
    const [admin, manufacturer, other] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await expect(sc.connect(manufacturer).registerBatch(1, 10)).to.be.revertedWithCustomError(sc, "StakeRequired");
    await expect(sc.connect(manufacturer).registerBatch(1, 0, {value: 1})).to.be.revertedWithCustomError(
      sc,
      "InvalidBatch"
    );

    await expect(sc.connect(manufacturer).registerBatch(1, 2, {value: ethers.parseEther("0.01")})).to.emit(
      sc,
      "BatchRegistered"
    );

    await expect(sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash)).to.emit(sc, "ProductMinted");
    await expect(sc.connect(manufacturer).mintProduct(101, 1, ethers.ZeroHash)).to.emit(sc, "ProductMinted");

    await expect(sc.connect(manufacturer).mintProduct(102, 1, ethers.ZeroHash)).to.be.revertedWithCustomError(
      sc,
      "BatchLimitReached"
    );

    await expect(sc.connect(other).mintProduct(200, 1, ethers.ZeroHash)).to.be.reverted;
  });
});