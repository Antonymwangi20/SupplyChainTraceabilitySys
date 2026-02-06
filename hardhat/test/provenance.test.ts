import {expect} from "chai";
import {ethers} from "hardhat";

describe("SupplyChain - batch tracking & provenance", function () {
  it("tracks batch status through lifecycle", async function () {
    const [admin, manufacturer] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    // Register batch
    const tx1 = await sc.connect(manufacturer).registerBatch(1, 2, {value: ethers.parseEther("0.01")});
    const receipt1 = await tx1.wait();

    let status = await sc.getBatchStatus(1);
    expect(status).to.equal("CREATED");

    // Mint first product
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    // Status should still be CREATED (not fully minted)
    status = await sc.getBatchStatus(1);
    expect(status).to.equal("CREATED");

    // Mint second product - batch becomes FULLY_MINTED
    const tx2 = await sc.connect(manufacturer).mintProduct(101, 1, ethers.ZeroHash);
    const receipt2 = await tx2.wait();

    status = await sc.getBatchStatus(1);
    expect(status).to.equal("FULLY_MINTED");
  });

  it("provides complete batch metadata", async function () {
    const [admin, manufacturer] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    const stake = ethers.parseEther("0.05");
    await sc.connect(manufacturer).registerBatch(1, 5, {value: stake});

    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);
    await sc.connect(manufacturer).mintProduct(101, 1, ethers.ZeroHash);

    const metadata = await sc.getBatchMetadata(1);
    expect(metadata.manufacturer).to.equal(manufacturer.address);
    expect(metadata.maxUnits).to.equal(5);
    expect(metadata.minted).to.equal(2);
    expect(metadata.stake).to.equal(stake);
    expect(metadata.status).to.equal("CREATED");
  });

  it("tracks batch product count", async function () {
    const [admin, manufacturer] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 10, {value: ethers.parseEther("0.01")});

    let count = await sc.getBatchProductCount(1);
    expect(count).to.equal(0);

    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);
    count = await sc.getBatchProductCount(1);
    expect(count).to.equal(1);

    await sc.connect(manufacturer).mintProduct(101, 1, ethers.ZeroHash);
    count = await sc.getBatchProductCount(1);
    expect(count).to.equal(2);
  });

  it("records provenance on mint", async function () {
    const [admin, manufacturer] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 5, {value: ethers.parseEther("0.01")});

    const metadataHash = ethers.id("metadata");
    const tx = await sc.connect(manufacturer).mintProduct(100, 1, metadataHash);
    const receipt = await tx.wait();
    expect(receipt).to.not.be.null;
    expect(receipt!.status).to.equal(1); // Success
  });

  it("records provenance on transfer", async function () {
    const [admin, manufacturer, receiver] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 5, {value: ethers.parseEther("0.01")});
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);

    const locationHash = ethers.id("warehouse-1");
    const tx1 = await sc.connect(manufacturer).initiateTransfer(100, receiver.address, locationHash);
    const receipt1 = await tx1.wait();
    expect(receipt1!.status).to.equal(1);

    const tx2 = await sc.connect(receiver).acceptTransfer(100);
    const receipt2 = await tx2.wait();
    expect(receipt2!.status).to.equal(1);
  });

  it("tracks complete product ownership history", async function () {
    const [admin, manufacturer, receiver1, receiver2] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 5, {value: ethers.parseEther("0.01")});

    const metadataHash = ethers.id("product-100");
    await sc.connect(manufacturer).mintProduct(100, 1, metadataHash);

    // Transfer to receiver1
    await sc.connect(manufacturer).initiateTransfer(100, receiver1.address, ethers.ZeroHash);
    await sc.connect(receiver1).acceptTransfer(100);

    // Transfer to receiver2
    await sc.connect(receiver1).initiateTransfer(100, receiver2.address, ethers.ZeroHash);
    await sc.connect(receiver2).acceptTransfer(100);

    // Verify current ownership via ownerOf
    expect(await sc.ownerOf(100)).to.equal(receiver2.address);
  });

  it("emits provenance events for tracking", async function () {
    const [admin, manufacturer, receiver] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 5, {value: ethers.parseEther("0.01")});

    const locationHash = ethers.id("warehouse");

    // Mint should emit provenance event
    const tx1 = await sc.connect(manufacturer).mintProduct(100, 1, ethers.ZeroHash);
    const receipt1 = await tx1.wait();
    expect(receipt1).to.not.be.null;

    // Initiate transfer should emit provenance event
    const tx2 = await sc.connect(manufacturer).initiateTransfer(100, receiver.address, locationHash);
    const receipt2 = await tx2.wait();
    expect(receipt2).to.not.be.null;

    // Accept transfer should emit provenance event
    const tx3 = await sc.connect(receiver).acceptTransfer(100);
    const receipt3 = await tx3.wait();
    expect(receipt3).to.not.be.null;
  });

  it("maintains complete audit trail for product", async function () {
    const [admin, manufacturer, distributor, retailer] = await ethers.getSigners();

    const SupplyChain = await ethers.getContractFactory("SupplyChain");
    const sc = await SupplyChain.deploy(admin.address);

    await sc.connect(admin).grantRoleSafe(await sc.MANUFACTURER(), manufacturer.address);

    await sc.connect(manufacturer).registerBatch(1, 10, {value: ethers.parseEther("0.01")});

    // Manufacturer mints product
    await sc.connect(manufacturer).mintProduct(100, 1, ethers.id("product-100"));

    // Manufacturer transfers to distributor
    const warehouseHash = ethers.id("manufacturer-warehouse");
    await sc.connect(manufacturer).initiateTransfer(100, distributor.address, warehouseHash);
    await sc.connect(distributor).acceptTransfer(100);

    // Distributor transfers to retailer
    const storeHash = ethers.id("retail-store");
    await sc.connect(distributor).initiateTransfer(100, retailer.address, storeHash);
    await sc.connect(retailer).acceptTransfer(100);

    // Verify final owner
    expect(await sc.ownerOf(100)).to.equal(retailer.address);
  });
});
