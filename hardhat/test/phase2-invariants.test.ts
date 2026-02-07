import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SupplyChain - Phase 2 invariants (resolved guard & non-re-raising)", () => {
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

  describe("Resolved guard (prevents re-disputes)", () => {
    it("prevents re-raising dispute after admin resolution", async () => {
      // First dispute
      await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect-1"));
      
      // Resolve in manufacturer's favor
      await sc.connect(admin).resolveDispute(PRODUCT_ID, manufacturer.address);

      // Attempt to raise another dispute on same product
      await expect(
        sc.connect(userB).raiseDispute(PRODUCT_ID, ethers.id("defect-2"))
      ).to.be.revertedWithCustomError(sc, "DisputeAlreadyResolved");
    });

    it("prevents re-raising dispute after auto-refund (claimRefund)", async () => {
      // Raise dispute
      await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect-1"));

      // Skip past refund window
      await time.increase(REFUND_WINDOW + 1);

      // Claim refund
      await sc.claimRefund(PRODUCT_ID);

      // Attempt to raise another dispute
      await expect(
        sc.connect(userB).raiseDispute(PRODUCT_ID, ethers.id("defect-2"))
      ).to.be.revertedWithCustomError(sc, "DisputeAlreadyResolved");
    });

    it("prevents re-raising dispute even if different user", async () => {
      // User A raises dispute
      await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect-1"));
      
      // Resolve
      await sc.connect(admin).resolveDispute(PRODUCT_ID, userA.address);

      // User B tries to raise dispute on same product
      await expect(
        sc.connect(userB).raiseDispute(PRODUCT_ID, ethers.id("defect-2"))
      ).to.be.revertedWithCustomError(sc, "DisputeAlreadyResolved");
    });
  });

  describe("Economic invariant: no dispute spam → refund farming", () => {
    it("product becomes non-disputable after first resolution", async () => {
      // Raise and resolve dispute
      await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));
      await sc.connect(admin).resolveDispute(PRODUCT_ID, manufacturer.address);

      // Attacker cannot create 2nd dispute to drain liquidity
      await expect(
        sc.connect(userB).raiseDispute(PRODUCT_ID, ethers.id("fake"))
      ).to.be.revertedWithCustomError(sc, "DisputeAlreadyResolved");
    });

    it("product becomes non-disputable after auto-refund (no grief loop)", async () => {
      // Raise dispute
      await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));

      // Skip past window and claim refund
      await time.increase(REFUND_WINDOW + 1);
      await sc.claimRefund(PRODUCT_ID);

      // Attacker cannot spam re-disputes post-refund
      await expect(
        sc.connect(userB).raiseDispute(PRODUCT_ID, ethers.id("spam"))
      ).to.be.revertedWithCustomError(sc, "DisputeAlreadyResolved");
    });

    it("prevents repeated dispute/refund cycles on same product", async () => {
      // Cycle 1
      await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect-1"));
      await time.increase(REFUND_WINDOW + 1);
      await sc.claimRefund(PRODUCT_ID);

      // Cycle 2 attempt (griefing)
      await expect(
        sc.connect(userB).raiseDispute(PRODUCT_ID, ethers.id("defect-2"))
      ).to.be.revertedWithCustomError(sc, "DisputeAlreadyResolved");
    });
  });

  describe("Lifecycle: dispute → resolution → non-disputable", () => {
    it("tracks state transitions: ACTIVE → RESOLVED", async () => {
      // Initial: no dispute
      expect(await sc.isDisputeActive(PRODUCT_ID)).to.be.false;

      // Raise: active
      await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));
      expect(await sc.isDisputeActive(PRODUCT_ID)).to.be.true;

      // Resolve: inactive
      await sc.connect(admin).resolveDispute(PRODUCT_ID, userA.address);
      expect(await sc.isDisputeActive(PRODUCT_ID)).to.be.false;

      // Verify terminal: cannot raise again
      await expect(
        sc.connect(userB).raiseDispute(PRODUCT_ID, ethers.id("new"))
      ).to.be.revertedWithCustomError(sc, "DisputeAlreadyResolved");
    });

    it("lifecycle via refund path: ACTIVE → AUTO_REFUNDED → TERMINAL", async () => {
      // Raise
      await sc.connect(userA).raiseDispute(PRODUCT_ID, ethers.id("defect"));
      expect(await sc.isDisputeActive(PRODUCT_ID)).to.be.true;

      // Wait for refund window
      await time.increase(REFUND_WINDOW + 1);

      // Claim refund
      await sc.claimRefund(PRODUCT_ID);
      expect(await sc.isDisputeActive(PRODUCT_ID)).to.be.false;

      // Verify terminal state: non-disputable
      await expect(
        sc.connect(userB).raiseDispute(PRODUCT_ID, ethers.id("spam"))
      ).to.be.revertedWithCustomError(sc, "DisputeAlreadyResolved");
    });
  });
});
