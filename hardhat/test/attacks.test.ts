import {expect} from "chai";
import {ethers} from "hardhat";

describe("SupplyChain - attack surfaces", function () {
  it("prevents forced custody (owner stays until receiver accepts)", async function () {
    const [admin, manufacturer, receiver] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);
    await sc.connect(manufacturer).registerBatch(1, 10, {value: 1});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    await sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.ZeroHash);
    expect(await sc.ownerOf(100)).to.equal(manufacturer.address);
  });

  it("rejects self-transfer and blocks initiating a second transfer while one is pending", async function () {
    const [admin, manufacturer, receiver] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);
    await sc.connect(manufacturer).registerBatch(1, 10, {value: 1});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    await expect(sc.connect(manufacturer).initiateTransfer(100, manufacturer.address, ethers.ZeroHash)).to.be.revertedWithCustomError(
      sc,
      "InvalidReceiver"
    );

    await sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.ZeroHash);

    await expect(sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.ZeroHash)).to.be.revertedWithCustomError(
      sc,
      "TransferAlreadyPending"
    );
  });
});