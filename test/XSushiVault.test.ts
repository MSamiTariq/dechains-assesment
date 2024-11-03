/*
Note: For running the tests "Should zap out xSushi and swap it back to USDT" and "Should zap USDT into xSushi and 
deposit into the vault", you need to impersonate another account with sufficient USDT balance. Comment out line 21 
and uncomment line 22 in XSushiVault.test.ts to ensure these tests run correctly.
*/

import { expect } from "chai";
import { ethers } from "hardhat";
import {
  XSushiVault,
  IERC20,
  ISushiBar,
  ISwapRouter,
} from "../typechain-types";

describe("XSushiVault", function () {
  let vault: XSushiVault;
  let xSushiToken: IERC20;
  let sushiToken: IERC20;
  let swapRouter: ISwapRouter;
  let sushiBar: ISushiBar;
  let usdtToken: IERC20;
  let owner: any;
  let user: any;
  let impersonatedSigner: any;
  const impersonatedAccount = "0xA78ef43Ac39681d62c61B575E3c65660E9043626"; // This is the address of the account with a lot of xSushi tokens
  // const impersonatedAccount = "0xf977814e90da44bfa03b6295a0616a897441acec";   // This is the address of the account with a lot of usdt tokens

  beforeEach(async function () {
    // Get signers
    [owner, user] = await ethers.getSigners();

    // Connect to the already deployed xSushi token
    xSushiToken = (await ethers.getContractAt(
      "IERC20",
      "0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272"
    )) as IERC20;

    // Connect to the already deployed Sushi token
    sushiToken = (await ethers.getContractAt(
      "IERC20",
      "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2"
    )) as IERC20;

    swapRouter = (await ethers.getContractAt(
      "ISwapRouter",
      "0xE592427A0AEce92De3Edee1F18E0157C05861564"
    )) as ISwapRouter;

    // Connect to the already deployed SushiBar contract
    sushiBar = (await ethers.getContractAt(
      "ISushiBar",
      "0x8798249c2E607446EfB7Ad49eC89dD1865Ff4272"
    )) as ISushiBar;

    usdtToken = (await ethers.getContractAt(
      "IERC20",
      "0xdac17f958d2ee523a2206206994597c13d831ec7"
    )) as IERC20;

    // Impersonate the account with a lot of xSushi tokens
    await ethers.provider.send("hardhat_impersonateAccount", [
      impersonatedAccount,
    ]);
    impersonatedSigner = await ethers.getSigner(impersonatedAccount);

    // Fund the impersonated account with some ETH to cover gas fees
    await owner.sendTransaction({
      to: impersonatedAccount,
      value: ethers.parseEther("1.0"), // Send 1 ETH
    });

    // Deploy the XSushiVault contract
    const VaultFactory = await ethers.getContractFactory("XSushiVault");
    vault = (await VaultFactory.deploy(
      xSushiToken,
      swapRouter,
      sushiToken,
      sushiBar
    )) as XSushiVault;

    // Withdraw some Sushi from the SushiBar using xSushi tokens to prepare for tests
    const xSushiBalance = await xSushiToken.balanceOf(
      impersonatedSigner.address
    );
    if (xSushiBalance > 0n) {
      const partialWithdrawAmount = ethers.parseUnits("10", 18);
      await xSushiToken
        .connect(impersonatedSigner)
        .approve(sushiBar.target, partialWithdrawAmount);
      await sushiBar.connect(impersonatedSigner).leave(partialWithdrawAmount);
    }
  });

  it("Should accept xSushi deposits and issue shares proportionally", async function () {
    const depositAmount = ethers.parseUnits("10", 18);

    // Impersonated account approves the vault to spend xSushi tokens
    await xSushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, depositAmount);

    // Deposit xSushi into the vault
    await vault
      .connect(impersonatedSigner)
      .deposit(depositAmount, impersonatedSigner.address);

    // Verify the impersonated account received shares equivalent to the deposit amount
    const userShares = await vault.balanceOf(impersonatedSigner.address);
    expect(userShares).to.equal(depositAmount);
  });

  it("Should allow users to withdraw xSushi against their shares", async function () {
    const depositAmount = ethers.parseUnits("10", 18);
    const userBalanceBeforeDeposit = await xSushiToken.balanceOf(
      impersonatedAccount
    );

    // Impersonated account approves the vault to spend xSushi tokens
    await xSushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, depositAmount);

    // Deposit xSushi into the vault
    await vault
      .connect(impersonatedSigner)
      .deposit(depositAmount, impersonatedSigner.address);

    // Impersonated account withdraws xSushi against their shares
    await vault
      .connect(impersonatedSigner)
      .withdraw(
        depositAmount,
        impersonatedSigner.address,
        impersonatedSigner.address
      );

    // Verify the impersonated account's share balance is zero after withdrawal
    const userSharesAfterWithdraw = await vault.balanceOf(
      impersonatedSigner.address
    );
    expect(userSharesAfterWithdraw).to.equal(0);

    // Verify the xSushi balance is back in the impersonated account's address
    const userBalance = await xSushiToken.balanceOf(impersonatedSigner.address);
    expect(userBalance).to.equal(userBalanceBeforeDeposit);
  });

  it("Should revert if the user tries to withdraw more xSushi than they have shares for", async function () {
    const depositAmount = ethers.parseUnits("10", 18);
    const withdrawAmount = ethers.parseUnits("15", 18); // More than the deposit

    // Impersonated account approves and deposits
    await xSushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, depositAmount);
    await vault
      .connect(impersonatedSigner)
      .deposit(depositAmount, impersonatedSigner.address);

    // Attempt to withdraw more than available shares should revert with a custom error
    await expect(
      vault
        .connect(impersonatedSigner)
        .withdraw(
          withdrawAmount,
          impersonatedSigner.address,
          impersonatedSigner.address
        )
    )
      .to.be.revertedWithCustomError(vault, "ERC4626ExceededMaxWithdraw")
      .withArgs(impersonatedSigner.address, withdrawAmount, depositAmount);
  });

  it("Should handle small deposits correctly and issue shares", async function () {
    const smallDepositAmount = ethers.parseUnits("0.01", 18);

    // Impersonated account approves and deposits a small amount
    await xSushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, smallDepositAmount);
    await vault
      .connect(impersonatedSigner)
      .deposit(smallDepositAmount, impersonatedSigner.address);

    // Verify the user received shares equivalent to the small deposit amount
    const userShares = await vault.balanceOf(impersonatedSigner.address);
    expect(userShares).to.equal(smallDepositAmount);
  });

  it("Should properly reflect the total supply of shares after multiple deposits", async function () {
    const firstDeposit = ethers.parseUnits("10", 18);
    const secondDeposit = ethers.parseUnits("20", 18);

    // First deposit
    await xSushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, firstDeposit);
    await vault
      .connect(impersonatedSigner)
      .deposit(firstDeposit, impersonatedSigner.address);

    // Second deposit by the same user since we don't have another address holding xSushi
    await xSushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, secondDeposit);
    await vault
      .connect(impersonatedSigner)
      .deposit(secondDeposit, owner.address);

    // Verify total supply reflects both deposits
    const totalSupply = await vault.totalSupply();
    expect(totalSupply).to.equal(BigInt(firstDeposit) + BigInt(secondDeposit));
  });

  it("Should allow users to partially withdraw their shares", async function () {
    const depositAmount = ethers.parseUnits("10", 18);
    const partialWithdrawAmount = ethers.parseUnits("5", 18); // Half the deposit

    // Impersonated account approves and deposits
    await xSushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, depositAmount);
    await vault
      .connect(impersonatedSigner)
      .deposit(depositAmount, impersonatedSigner.address);

    // Impersonated account withdraws part of their shares
    await vault
      .connect(impersonatedSigner)
      .withdraw(
        partialWithdrawAmount,
        impersonatedSigner.address,
        impersonatedSigner.address
      );

    // Verify the user's remaining shares
    const remainingShares = await vault.balanceOf(impersonatedSigner.address);
    expect(remainingShares).to.equal(
      BigInt(depositAmount) - BigInt(partialWithdrawAmount)
    );
  });

  it("Should revert if an account without xSushi tries to deposit", async function () {
    const depositAmount = ethers.parseUnits("10", 18);

    // Ensure the user account does not have xSushi tokens
    const userBalance = await xSushiToken.balanceOf(user.address);
    expect(userBalance).to.equal(0);

    // User tries to deposit without having xSushi tokens
    await expect(
      vault.connect(user).deposit(depositAmount, user.address)
    ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
  });

  // Tests for Zap in functionality
  it("Should zap input token into xSushi and deposit into the vault (Case where input token is Sushi)", async function () {
    const inputToken = sushiToken.target;
    // const amountIn = ethers.parseUnits("10", 18);
    const amountIn = await sushiToken.balanceOf(impersonatedSigner.address);
    const poolFee = 3000; // Example fee tier for Uniswap V3

    // Impersonated account approves the vault to spend Sushi tokens
    await sushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, amountIn);

    // Call the zap function
    await vault.connect(impersonatedSigner).zap(inputToken, amountIn, poolFee);

    // Verify that the vault holds the xSushi tokens and that shares were issued
    const userShares = await vault.balanceOf(impersonatedSigner.address);
    expect(userShares).to.be.gt(0);
  });

  it("Should revert when trying to zap with zero input amount", async function () {
    const inputToken = sushiToken.target;
    const amountIn = ethers.parseUnits("0", 18);
    const poolFee = 3000;

    await expect(
      vault.connect(impersonatedSigner).zap(inputToken, amountIn, poolFee)
    ).to.be.revertedWithCustomError(vault, "AmountMustBeGreaterThanZero");
  });

  it("Should issue shares proportionally to the zap amount", async function () {
    const inputToken = sushiToken.target;
    const amountIn = await sushiToken.balanceOf(impersonatedSigner.address);
    const poolFee = 3000;

    await sushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, amountIn);
    await vault.connect(impersonatedSigner).zap(inputToken, amountIn, poolFee);

    const userShares = await vault.balanceOf(impersonatedSigner.address);
    expect(userShares).to.be.closeTo(amountIn, ethers.parseUnits("10", 18));
  });

  it("Should zap USDT into xSushi and deposit into the vault", async function () {
    const inputToken = usdtToken.target;
    const amountIn = ethers.parseUnits("10", 6); // 100 USDt
    const poolFee = 3000;

    // Fund the impersonated account with some USDT for testing
    await usdtToken.connect(impersonatedSigner).approve(vault.target, amountIn);

    // Call the zap function
    await vault.connect(impersonatedSigner).zap(inputToken, amountIn, poolFee);

    // Verify that the vault holds the xSushi tokens and that shares were issued
    const userShares = await vault.balanceOf(impersonatedSigner.address);
    expect(userShares).to.be.gt(0);
  });

  it("Should zap out xSushi and swap it back to USDT", async function () {
    const inputToken = usdtToken.target;
    const amountIn = ethers.parseUnits("100", 6); // 100 USDT
    const poolFee = 3000;

    // Zap in USDT to xSushi
    await usdtToken.connect(impersonatedSigner).approve(vault.target, amountIn);
    await vault.connect(impersonatedSigner).zap(inputToken, amountIn, poolFee);

    const userShares = await vault.balanceOf(impersonatedSigner.address);

    // Call the zapOut function to swap xSushi back to USDT
    await vault
      .connect(impersonatedSigner)
      .zapOut(userShares, usdtToken.target, poolFee);

    // Verify the USDT balance after zap out
    const usdtBalanceAfter = await usdtToken.balanceOf(
      impersonatedSigner.address
    );
    expect(usdtBalanceAfter).to.be.gt(amountIn);
  });

  it("Should zap out xSushi and swap it back to Sushi", async function () {
    const inputToken = sushiToken.target;
    const amountIn = ethers.parseUnits("10", 18); // 10 Sushi
    const poolFee = 3000;

    // Zap in Sushi to xSushi
    await sushiToken
      .connect(impersonatedSigner)
      .approve(vault.target, amountIn);
    await vault.connect(impersonatedSigner).zap(inputToken, amountIn, poolFee);

    const userShares = await vault.balanceOf(impersonatedSigner.address);

    // Call the zapOut function to swap xSushi back to Sushi
    await vault
      .connect(impersonatedSigner)
      .zapOut(userShares, sushiToken.target, poolFee);

    // Verify the XSushi balance after zap out
    const sushiBalanceAfter = await xSushiToken.balanceOf(
      impersonatedSigner.address
    );
    expect(sushiBalanceAfter).to.be.gt(amountIn);
  });
});
