# xSushi Vault Project

## Project Overview
This project is an implementation of an ERC4626-compliant vault for staking Sushi tokens and managing xSushi shares. The contract is designed to support advanced functionalities, including the ability to zap in and out with various tokens through a Uniswap V3 swap router. The vault allows users to deposit tokens, receive xSushi, and handle withdrawals in a secure and efficient manner.

## Project Structure
```
- contracts/
  - XSushiVault.sol
- test/
  - XSushiVault.test.ts
- hardhat.config.ts
- package.json
- README.md
```

### Smart Contract Functionality & Standards Compliance
- **ERC4626 Compliance**: The `XSushiVault` contract fully adheres to the ERC4626 vault standard, ensuring compatibility and best practices for tokenized vaults.
- **Integration with SushiBar**: The vault interacts directly with the SushiBar contract, allowing users to stake Sushi and receive xSushi tokens.
- **Multi-Swap Functionality**: The `zap` function can handle both direct swaps and multi-hop swaps (e.g., token → WETH → Sushi), utilizing the Uniswap V3 router for flexible token exchanges.

### Code Quality & Security
- **Security Best Practices**: The contract uses OpenZeppelin's `SafeERC20` for secure token transfers and `ReentrancyGuard` to prevent re-entrancy attacks.
- **Custom Errors**: Custom error handling (e.g., `AmountMustBeGreaterThanZero`) is implemented for better gas optimization.
- **Gas Optimization**: The contract follows best practices for minimizing gas usage, such as using `immutable` variables where applicable.

### Design Choices
- **ERC4626 Standard**: Ensures that the vault follows industry standards for asset management.
- **Modular Swap Logic**: The `zap` function was designed to handle both simple and complex token swaps, making it versatile for different token input scenarios.
- **Custom Error Handling**: The use of custom errors in place of `require` statements reduces gas consumption and enhances code readability.

### Assumptions
- The Uniswap V3 router is assumed to have sufficient liquidity for the input tokens.
- The contract is designed to interact with known addresses for tokens like Sushi and xSushi.

## Setting Up the Project Locally
1. **Clone the repository**:
   ```bash
   git clone https://github.com/MSamiTariq/dechains-assesment.git
   cd dechains-assesment
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Compile the contracts**:
   ```bash
   npx hardhat compile
   ```

## Running the Tests
1. **Run the test suite**:
   ```bash
   npx hardhat test
   ```

### Test Coverage
The tests cover the following scenarios:
- **Basic Deposits and Withdrawals**:
  - Validations for depositing xSushi and receiving shares proportionally.
- **Zap In and Zap Out**:
  - Tests for zapping into the vault with Sushi and other tokens like USDC, ensuring that swaps are handled properly.
  - Validation of multi-hop swaps through WETH.
- **Reverts and Edge Cases**:
  - Test for zapping with a zero amount using `revertedWithCustomError`.
  - Tests for insufficient approvals and verifying proper reverts.
- **Gas Usage**:
  - Verified gas usage for operations to ensure they remain within acceptable limits.

### Example Test Case Highlights
- **Zero Amount Revert**:
  ```typescript
  it("Should revert when trying to zap with zero input amount", async function () {
    const inputToken = sushiToken.address;
    const amountIn = ethers.utils.parseUnits("0", 18);
    const poolFee = 3000;

    await expect(
      vault.connect(impersonatedSigner).zap(inputToken, amountIn, poolFee)
    ).to.be.revertedWithCustomError(vault, "AmountMustBeGreaterThanZero");
  });
  ```
- **Zap USDC to xSushi**:
  ```typescript
  it("Should zap USDC into xSushi and deposit into the vault", async function () {
    const inputToken = usdcToken.address;
    const amountIn = ethers.utils.parseUnits("100", 6);
    const poolFee = 3000;

    await usdcToken.connect(impersonatedSigner).approve(vault.address, amountIn);
    await vault.connect(impersonatedSigner).zap(inputToken, amountIn, poolFee);

    const userShares = await vault.balanceOf(impersonatedSigner.address);
    expect(userShares).to.be.gt(0);
  });
  ```
  **Note**: For running the tests `"Should zap out xSushi and swap it back to USDT"` and `"Should zap USDT into xSushi and deposit into the vault"`, you need to impersonate another account with sufficient USDT balance. Comment out line 21 and uncomment line 22 in `XSushiVault.test.ts` to ensure these tests run correctly.

## Gas Usage Analysis
The gas profiler output showed the following values:
```
·----------------------------|---------------------------|-------------|-----------------------------·
|    Solc version: 0.8.27    ·  Optimizer enabled: true  ·  Runs: 200  ·  Block limit: 30000000 gas  │
·····························|···························|·············|······························
|  Methods                                                                                           │
················|············|·············|·············|·············|···············|··············
|  Contract     ·  Method    ·  Min        ·  Max        ·  Avg        ·  # calls      ·  usd (avg)  │
················|············|·············|·············|·············|···············|··············
|  XSushiVault  ·  approve   ·      26295  ·      48549  ·      36834  ·           25  ·          -  │
|  XSushiVault  ·  deposit   ·      78314  ·     112502  ·     107616  ·            7  ·          -  │
|  XSushiVault  ·  withdraw  ·      49302  ·      61627  ·      55465  ·            2  ·          -  │
|  XSushiVault  ·  zap       ·     193948  ·     193977  ·     193967  ·            3  ·          -  │
|  XSushiVault  ·  zapOut    ·          -  ·          -  ·     108838  ·            1  ·          -  │
················|············|·············|·············|·············|···············|··············
|  Deployments               ·                                         ·  % of limit   ·             │
|  XSushiVault               ·          -  ·          -  ·    1915359  ·        6.4 %  ·          -  │
·----------------------------|-------------|-------------|-------------|---------------|-------------·
```
### Analysis:
- **Gas Efficiency**: The gas costs for operations such as `zap` and `deposit` are within acceptable limits.
- **Optimization Level**: The Solidity optimizer was set to `runs: 200`, providing a good balance between deployment cost and runtime efficiency.

## Noteworthy Implementation Details
- **Gas Optimization**: By using custom errors and efficient ERC20 transfer handling, the contract minimizes gas usage.
- **Security**: The contract is guarded against re-entrancy through the use of OpenZeppelin's `ReentrancyGuard`.

## Potential Improvements
- **Slippage Handling**: Adding a slippage parameter to ensure minimum output during swaps can make the contract more robust.
- **Fee Mechanism**: Implementing a fee collection mechanism could enhance functionality for use cases like protocol revenue generation.

## Conclusion
This project showcases a well-structured implementation of an ERC4626 vault that integrates with DeFi protocols like SushiBar and Uniswap V3. It follows best practices in Solidity development, including comprehensive testing, gas optimization, and clear documentation.

