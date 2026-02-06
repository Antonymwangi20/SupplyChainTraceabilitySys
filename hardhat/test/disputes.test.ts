import {expect} from "chai";
import {ethers} from "hardhat";

describe("SupplyChain - disputes & relayer", function () {
  it("raises and resolves disputes with stake slashing", async function () {
    const [admin, manufacturer, receiver, disputer] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    const stake = ethers.parseEther("0.1");
    await sc.connect(manufacturer).registerBatch(1, 5, {value: stake});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    // Initiate transfer
    await sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.ZeroHash);

    // Raise dispute with reason hash
    const reasonHash = ethers.id("Unauthorized transfer");
    await expect(sc.connect(disputer).raiseDispute(100, reasonHash))
      .to.emit(sc, "DisputeRaised");

    expect(await sc.isDisputeActive(100)).to.be.true;

    // Resolve dispute in favor of disputer - slash stake
    const balanceBefore = await ethers.provider.getBalance(disputer.address);
    await sc.connect(admin).resolveDispute(100, disputer.address);
    const balanceAfter = await ethers.provider.getBalance(disputer.address);

    expect(balanceAfter).to.be.gt(balanceBefore); // disputer received slashed amount
    expect(await sc.isDisputeActive(100)).to.be.false;

    // Pending transfer should be cleared
    await expect(sc.connect(receiver).acceptTransfer(100))
      .to.be.revertedWithCustomError(sc, "NoPendingTransfer");
  });

  it("blocks transfers when dispute is active", async function () {
    const [admin, manufacturer, receiver] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 5, {value: ethers.parseEther("0.01")});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    // Initiate transfer
    await sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.ZeroHash);

    // Raise dispute
    await sc.connect(admin).raiseDispute(100, ethers.id("Fraud suspected"));

    // Try to accept transfer - should fail due to active dispute
    await expect(sc.connect(receiver).acceptTransfer(100))
      .to.be.revertedWithCustomError(sc, "DisputeNotActive");
  });

  it("approves relayers and executes meta-transactions", async function () {
    const [admin, manufacturer, receiver, relayer] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);
    await sc.connect(admin).approveRelayer(relayer.address);

    await sc.connect(manufacturer).registerBatch(1, 5, {value: ethers.parseEther("0.01")});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    // Create signature for transfer
    const domain = {
      name: "SupplyChain",
      version: "1",
      chainId: await ethers.provider.getNetwork().then(n => n.chainId),
      verifyingContract: await sc.getAddress()
    };

    const types = {
      InitiateTransfer: [
        {name: "productId", type: "uint256"},
        {name: "to", type: "address"},
        {name: "locationHash", type: "bytes32"},
        {name: "nonce", type: "uint256"},
        {name: "deadline", type: "uint256"}
      ]
    };

    const nonce = await sc.nonces(manufacturer.address);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
    const locationHash = ethers.id("warehouse");

    const value = {
      productId: 100,
      to: receiver.address,
      locationHash: locationHash,
      nonce: nonce,
      deadline: deadline
    };

    const signature = await manufacturer.signTypedData(domain, types, value);

    // Relayer executes meta-transaction
    await expect(
      sc.connect(relayer).executeMetaTx(
        manufacturer.address,
        100,
        receiver.address,
        locationHash,
        nonce,
        deadline,
        signature
      )
    )
      .to.emit(sc, "TransferInitiated")
      .to.emit(sc, "MetaTxExecuted");

    expect(await sc.nonces(manufacturer.address)).to.equal(nonce + 1n);
  });

  it("rejects non-approved relayers", async function () {
    const [admin, manufacturer, receiver, nonApprovedRelayer] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 5, {value: ethers.parseEther("0.01")});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    const domain = {
      name: "SupplyChain",
      version: "1",
      chainId: await ethers.provider.getNetwork().then(n => n.chainId),
      verifyingContract: await sc.getAddress()
    };

    const types = {
      InitiateTransfer: [
        {name: "productId", type: "uint256"},
        {name: "to", type: "address"},
        {name: "locationHash", type: "bytes32"},
        {name: "nonce", type: "uint256"},
        {name: "deadline", type: "uint256"}
      ]
    };

    const nonce = await sc.nonces(manufacturer.address);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;
    const locationHash = ethers.id("warehouse");

    const value = {
      productId: 100,
      to: receiver.address,
      locationHash: locationHash,
      nonce: nonce,
      deadline: deadline
    };

    const signature = await manufacturer.signTypedData(domain, types, value);

    // Non-approved relayer tries to execute - should fail
    await expect(
      sc.connect(nonApprovedRelayer).executeMetaTx(
        manufacturer.address,
        100,
        receiver.address,
        locationHash,
        nonce,
        deadline,
        signature
      )
    ).to.be.revertedWithCustomError(sc, "NoRelayerApproval");
  });

  it("enforces two-step transfer even with disputes", async function () {
    const [admin, manufacturer, receiver] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 5, {value: ethers.parseEther("0.01")});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    // Try to initiate transfer while dispute is already active
    await sc.connect(admin).raiseDispute(100, ethers.id("Preemptive dispute"));

    await expect(sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.ZeroHash))
      .to.be.revertedWithCustomError(sc, "DisputeNotActive");

    // Resolve dispute
    await sc.connect(admin).resolveDispute(100, admin.address);

    // Now transfer should work
    await expect(sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.ZeroHash))
      .to.emit(sc, "TransferInitiated");
  });

  it("maintains transfer state after initiation", async function () {
    const [admin, manufacturer, receiver] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 5, {value: ethers.parseEther("0.01")});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    // Initiate transfer
    await sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.id("location-1"));

    // Product owner should still be manufacturer
    expect(await sc.ownerOf(100)).to.equal(manufacturer.address);

    // Try to initiate another transfer - should fail
    await expect(
      sc.connect(manufacturer).initiateTransfer(100, receiver.address, ethers.id("location-2"))
    ).to.be.revertedWithCustomError(sc, "TransferAlreadyPending");

    // Accept transfer
    await sc.connect(receiver).acceptTransfer(100);

    // Now owner should be receiver
    expect(await sc.ownerOf(100)).to.equal(receiver.address);
  });
});
