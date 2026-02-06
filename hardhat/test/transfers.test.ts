import {expect} from "chai";
import {ethers} from "hardhat";

describe("SupplyChain - transfers", function () {
  async function deployFixture() {
    const [admin, manufacturer, receiver, relayer, other] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);
    await sc.connect(manufacturer).registerBatch(1, 10, {value: ethers.parseEther("0.01")});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    return {sc, admin, manufacturer, receiver, relayer, other};
  }

  it("does not change ownership until receiver accepts", async function () {
    const {sc, manufacturer, receiver, other} = await deployFixture();

    await expect(sc.connect(other).initiateTransfer(100, receiver.address, ethers.ZeroHash)).to.be.revertedWithCustomError(
      sc,
      "NotAuthorized"
    );

    await expect(sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.ZeroHash)).to.emit(
      sc,
      "TransferInitiated"
    );

    expect(await sc.ownerOf(100)).to.equal(manufacturer.address);

    await expect(sc.connect(other).acceptTransfer(100)).to.be.reverted;

    await expect(sc.connect(receiver).acceptTransfer(100)).to.emit(sc, "TransferAccepted");
    expect(await sc.ownerOf(100)).to.equal(receiver.address);
  });

  it("supports EIP-712 meta-tx for initiate and accept", async function () {
    const {sc, manufacturer, receiver, relayer} = await deployFixture();

    const network = await ethers.provider.getNetwork();
    const domain = {
      name: "SupplyChain",
      version: "1",
      chainId: Number(network.chainId),
      verifyingContract: await sc.getAddress()
    };

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const nonceFrom = await sc.nonces(manufacturer.address);

    const initiateTypes = {
      InitiateTransfer: [
        {name: "productId", type: "uint256"},
        {name: "to", type: "address"},
        {name: "locationHash", type: "bytes32"},
        {name: "nonce", type: "uint256"},
        {name: "deadline", type: "uint256"}
      ]
    };

    const initiateValue = {
      productId: 100n,
      to: receiver.address,
      locationHash: ethers.ZeroHash,
      nonce: nonceFrom,
      deadline
    };

    const initiateSig = await manufacturer.signTypedData(domain, initiateTypes, initiateValue);

    await expect(
      sc
        .connect(relayer)
        .initiateTransferWithSig(100, receiver.address, ethers.ZeroHash, nonceFrom, deadline, initiateSig)
    ).to.emit(sc, "TransferInitiated");

    const nonceTo = await sc.nonces(receiver.address);
    const acceptTypes = {
      AcceptTransfer: [
        {name: "productId", type: "uint256"},
        {name: "nonce", type: "uint256"},
        {name: "deadline", type: "uint256"}
      ]
    };
    const acceptValue = {productId: 100n, nonce: nonceTo, deadline};
    const acceptSig = await receiver.signTypedData(domain, acceptTypes, acceptValue);

    await expect(sc.connect(relayer).acceptTransferWithSig(100, nonceTo, deadline, acceptSig)).to.emit(
      sc,
      "TransferAccepted"
    );

    expect(await sc.ownerOf(100)).to.equal(receiver.address);
  });
});