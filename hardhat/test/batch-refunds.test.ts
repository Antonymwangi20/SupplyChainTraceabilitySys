import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SupplyChain - batch refunds & dispute windows", () => {
  let sc: any;
  let admin: any, manufacturer: any, userA: any, userB: any;

  const BATCH_ID = 1;
  const PRODUCT_ID = 1;
  const BATCH_SIZE = 100;
  const STAKE = ethers.parseEther("10");

  const DISPUTE_WINDOW = 7 * 24 * 60 * 60; // 7 days
  const REFUND_WINDOW = 14 * 24 * 60 * 60; // 14 days

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    admin = signers[0];
    manufacturer = signers[1];
    userA = signers[2];
    userB = signers[3];

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    sc = await SupplyChain.deploy(admin.address);

    // Grant manufacturer role
    const MANUFACTURER_ROLE = ethers.id("MANUFACTURER");
    await sc.connect(admin).grantRole(MANUFACTURER_ROLE, manufacturer.address);

    // Register batch with manufacturer
    await sc.connect(manufacturer).registerBatch(BATCH_ID, BATCH_SIZE, { value: STAKE });

    // Mint product
    await sc.connect(manufacturer).mintProduct(PRODUCT_ID, BATCH_ID, ethers.id("metadata"));
  });

  it("refunds manufacturer stake if found innocent during dispute window", async () => {
    // Raise dispute
    await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));

    const initialBalance = await ethers.provider.getBalance(manufacturer.address);

    // Resolve dispute in manufacturer's favor within window
    await sc.connect(admin).resolveDispute(PRODUCT_ID, manufacturer.address);

    const finalBalance = await ethers.provider.getBalance(manufacturer.address);
    
    // Manufacturer should receive refund
    const refundedAmount = finalBalance - initialBalance;
    expect(refundedAmount).to.be.gt(0);
  });

  it("prevents dispute resolution after dispute window expires", async () => {
    // Raise dispute
    await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));

    // Skip past dispute resolution window
    await time.increase(DISPUTE_WINDOW + 1);

    // Attempt to resolve should fail
    await expect(
      sc.connect(admin).resolveDispute(PRODUCT_ID, userA.address)
    ).to.be.revertedWithCustomError(sc, "DeadlineExpired");
  });

  it("allows auto-refund of stake after refund window closes", async () => {
    // Raise dispute
    await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));

    const initialBalance = await ethers.provider.getBalance(manufacturer.address);

    // Skip past refund window without resolving
    await time.increase(REFUND_WINDOW + 1);

    // Claim refund (can be called by anyone)
    const tx = await sc.claimRefund(PRODUCT_ID);
    await tx.wait();

    const finalBalance = await ethers.provider.getBalance(manufacturer.address);
    
    // Manufacturer should receive refund even if admin didn't resolve
    const refundedAmount = finalBalance - initialBalance;
    expect(refundedAmount).to.be.gt(0);
  });

  it("prevents double-claiming refunds", async () => {
    // Raise dispute
    await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));

    // Skip past refund window
    await time.increase(REFUND_WINDOW + 1);

    // Claim refund
    await sc.claimRefund(PRODUCT_ID);

    // Try to claim again
    await expect(sc.claimRefund(PRODUCT_ID)).to.be.revertedWithCustomError(
      sc,
      "DisputeAlreadyResolved"
    );
  });

  it("tracks dispute state correctly (active, resolved)", async () => {
    // Raise dispute
    await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));
    expect(await sc.isDisputeActive(PRODUCT_ID)).to.be.true;

    // Resolve dispute
    await sc.connect(admin).resolveDispute(PRODUCT_ID, manufacturer.address);
    expect(await sc.isDisputeActive(PRODUCT_ID)).to.be.false;
  });

  it("prevents claim refund if dispute still active", async () => {
    // Raise dispute
    await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));

    // Skip a short time but still before refund window
    await time.increase(24 * 60 * 60); // 1 day

    // Claim refund should fail (refund window not reached)
    await expect(sc.claimRefund(PRODUCT_ID)).to.be.revertedWithCustomError(
      sc,
      "DeadlineExpired"
    );
  });

  it("preserves dispute resolution within window (no deadline breach)", async () => {
    // Raise dispute
    await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));

    // Advance time just under the window
    await time.increase(DISPUTE_WINDOW - 100);

    // Resolution should succeed
    await expect(
      sc.connect(admin).resolveDispute(PRODUCT_ID, userA.address)
    ).not.to.be.reverted;
  });

  it("emits ProvenanceRecorded event with DISPUTE_REFUNDED when manufacturer wins", async () => {
    // Raise dispute
    await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));

    // Resolve in manufacturer's favor
    const tx = await sc.connect(admin).resolveDispute(PRODUCT_ID, manufacturer.address);
    
    // Check for ProvenanceRecorded event with DISPUTE_REFUNDED action
    const receipt = await tx.wait();
    const events = receipt?.logs || [];
    
    const hasRefundEvent = events.some((log: any) => {
      try {
        const decodedLog = sc.interface.parseLog(log);
        return (
          decodedLog?.name === "ProvenanceRecorded" &&
          decodedLog?.args[3] === "DISPUTE_REFUNDED"
        );
      } catch {
        return false;
      }
    });

    expect(hasRefundEvent).to.be.true;
  });

  it("slashes properly if manufacturer loses (old behavior preserved)", async () => {
    // Initiate transfer first
    await sc.connect(manufacturer).initiateTransfer(PRODUCT_ID, userA.address, ethers.id("warehouse"));

    // Raise dispute
    await sc.connect(userB).raiseDispute(PRODUCT_ID, ethers.id("defect"));

    const userABalanceBefore = await ethers.provider.getBalance(userA.address);

    // Resolve against manufacturer
    await sc.connect(admin).resolveDispute(PRODUCT_ID, userA.address);

    const userABalanceAfter = await ethers.provider.getBalance(userA.address);
    
    // UserA should receive slashed amount (50% of stake)
    expect(userABalanceAfter).to.be.gt(userABalanceBefore);
  });
});
