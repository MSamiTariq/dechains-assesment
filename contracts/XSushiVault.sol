// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

interface ISushiBar {
    function enter(uint256 _amount) external;
    function leave(uint256 _share) external;
}

contract XSushiVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ISwapRouter public immutable swapRouter;
    address public immutable sushiToken;
    address public immutable xSushiToken;
    address public immutable sushiBar;

    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // Custom error for input validation
    error AmountMustBeGreaterThanZero();

    constructor(
        ERC20 _xSushi,
        ISwapRouter _swapRouter,
        address _sushiToken,
        address _sushiBar
    ) ERC20("xSushi Vault Token", "vXSUSHI") ERC4626(_xSushi) {
        swapRouter = _swapRouter;
        sushiToken = _sushiToken;
        xSushiToken = address(_xSushi);
        sushiBar = _sushiBar;
    }

    /**
     * @notice This function allows users to deposit any token, swap it for Sushi, stake in the SushiBar to get xSushi,
     * and deposit the xSushi into the vault to receive shares.
     * @param inputToken The address of the token the user wants to zap into the vault.
     * @param amountIn The amount of the input token the user wants to zap.
     * @param poolFee The fee tier for Uniswap V3 pool.
     */
    function zap(
        address inputToken,
        uint256 amountIn,
        uint24 poolFee
    ) external nonReentrant {
        if (amountIn == 0) {
            revert AmountMustBeGreaterThanZero();
        }

        TransferHelper.safeTransferFrom(
            inputToken,
            msg.sender,
            address(this),
            amountIn
        );

        uint256 sushiAmount;

        if (inputToken != sushiToken) {
            // Approve the swap router to spend the input token
            TransferHelper.safeApprove(
                inputToken,
                address(swapRouter),
                amountIn
            );

            // Code for a single swap, this has been commented out since we are using a multi-hop swap

            // ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            //     .ExactInputSingleParams({
            //         tokenIn: inputToken,
            //         tokenOut: address(sushiToken),
            //         fee: poolFee,
            //         recipient: address(this),
            //         deadline: block.timestamp,
            //         amountIn: amountIn,
            //         amountOutMinimum: 0,
            //         sqrtPriceLimitX96: 0
            //     });

            // sushiAmount = swapRouter.exactInputSingle(params);

            ISwapRouter.ExactInputParams memory params = ISwapRouter
                .ExactInputParams({
                    path: abi.encodePacked(
                        inputToken,
                        poolFee,
                        WETH,
                        poolFee,
                        address(sushiToken)
                    ),
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: amountIn,
                    amountOutMinimum: 0
                });

            // Executes the swap.
            sushiAmount = swapRouter.exactInput(params);
        } else {
            // If the input token is already Sushi, no need to swap
            sushiAmount = amountIn;
        }

        // Approve the SushiBar to stake Sushi
        IERC20(sushiToken).approve(sushiBar, sushiAmount);

        // Stake Sushi in SushiBar to receive xSushi
        ISushiBar(sushiBar).enter(sushiAmount);

        // Get the amount of xSushi received
        uint256 xSushiAmount = IERC20(xSushiToken).balanceOf(address(this));

        // Approve the vault to deposit xSushi
        IERC20(xSushiToken).approve(address(this), xSushiAmount);

        uint256 shares;
        if (totalSupply() == 0) {
            shares = xSushiAmount; // Directly issue shares equal to the deposit amount for the first deposit.
        } else {
            shares = previewDeposit(xSushiAmount);
        }

        // Perform the deposit using the internal function
        _deposit(address(this), msg.sender, xSushiAmount, shares);
    }

    /**
     * @notice This function allows users to withdraw xSushi, convert it back to Sushi, and optionally swap to another token.
     * @param shares The amount of xSushi shares to withdraw.
     * @param outputToken The token the user wants to receive after swapping.
     * @param poolFee The fee tier for Uniswap V3 pool.
     */
    function zapOut(
        uint256 shares,
        address outputToken,
        uint24 poolFee
    ) external nonReentrant {
        require(shares > 0, "Shares must be greater than zero");

        // Withdraw xSushi from the vault to the contract
        _withdraw(msg.sender, address(this), msg.sender, shares, shares);

        // Approve the SushiBar to convert xSushi back to Sushi
        IERC20(xSushiToken).approve(sushiBar, shares);
        ISushiBar(sushiBar).leave(shares);

        uint256 sushiAmount = IERC20(sushiToken).balanceOf(address(this));
        if (outputToken != sushiToken) {
            // Approve the swap router to spend Sushi
            IERC20(sushiToken).approve(address(swapRouter), sushiAmount);

            // Code for a single swap, this has been commented out since we are using a multi-hop swap

            // ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            //     .ExactInputSingleParams({
            //         tokenIn: address(sushiToken),
            //         tokenOut: outputToken,
            //         fee: poolFee,
            //         recipient: msg.sender,
            //         deadline: block.timestamp,
            //         amountIn: sushiAmount,
            //         amountOutMinimum: 0,
            //         sqrtPriceLimitX96: 0
            //     });

            // swapRouter.exactInputSingle(params);

            ISwapRouter.ExactInputParams memory params = ISwapRouter
                .ExactInputParams({
                    path: abi.encodePacked(
                        address(sushiToken),
                        poolFee,
                        WETH,
                        poolFee,
                        outputToken
                    ),
                    recipient: msg.sender,
                    deadline: block.timestamp,
                    amountIn: sushiAmount,
                    amountOutMinimum: 0
                });

            // Executes the swap.
            swapRouter.exactInput(params);
        } else {
            // Transfer Sushi directly to the user if no swap is needed
            IERC20(sushiToken).safeTransfer(msg.sender, sushiAmount);
        }
    }
}
