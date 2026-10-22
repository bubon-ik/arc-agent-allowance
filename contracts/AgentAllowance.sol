// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentAllowance
 * @notice Spending limit controller for an AI agent using owner-approved ERC-20 allowance.
 * @dev This contract never custody-holds tokens. It pulls funds via `transferFrom(owner, to, amount)`.
 *
 * Revoke path: the owner can revoke agent spending by setting the token allowance for this contract to zero
 * from their wallet (e.g. `token.approve(address(this), 0)`).
 */
contract AgentAllowance is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public immutable agent;
    address public immutable token;

    uint256 public perTxCap;
    uint256 public dailyCap;
    uint256 public expiry;

    bool public paused;

    uint256 public currentDayIndex;
    uint256 public spentToday;

    event Spent(address indexed to, uint256 amount, uint256 spentToday);
    event LimitsUpdated(uint256 perTxCap, uint256 dailyCap, uint256 expiry);
    event Paused();
    event Unpaused();

    error NotOwner();
    error NotAgent(address caller, address agent);
    error ContractPaused();
    error Expired();
    error PerTxCapExceeded(uint256 amount, uint256 perTxCap);
    error DailyCapExceeded(uint256 attempted, uint256 spentToday, uint256 dailyCap);
    error ZeroAddress();
    error InvalidLimits();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent(msg.sender, agent);
        _;
    }

    /**
     * @notice Initializes the controller with owner, agent, token, limits, and expiry.
     * @param owner_ The owner whose tokens are spent via allowance.
     * @param agent_ The authorized agent allowed to call spend.
     * @param token_ The ERC-20 token address (USDC).
     * @param perTxCap_ Maximum amount spendable per transaction.
     * @param dailyCap_ Maximum cumulative amount spendable per day.
     * @param expiry_ Unix timestamp after which spending is disabled.
     */
    constructor(
        address owner_,
        address agent_,
        address token_,
        uint256 perTxCap_,
        uint256 dailyCap_,
        uint256 expiry_
    ) {
        if (owner_ == address(0) || agent_ == address(0) || token_ == address(0)) {
            revert ZeroAddress();
        }
        if (perTxCap_ == 0 || dailyCap_ == 0 || dailyCap_ < perTxCap_) {
            revert InvalidLimits();
        }
        if (expiry_ <= block.timestamp) revert Expired();

        owner = owner_;
        agent = agent_;
        token = token_;
        perTxCap = perTxCap_;
        dailyCap = dailyCap_;
        expiry = expiry_;
    }

    /**
     * @notice Spends tokens from the owner's balance to a recipient within configured caps.
     * @dev Non-reentrant. Follows CEI (checks-effects-interactions) by updating `spentToday`
     * before the external token transfer.
     * @param to Recipient address.
     * @param amount Amount to transfer.
     */
    function spend(address to, uint256 amount) external onlyAgent nonReentrant {
        if (paused) revert ContractPaused();
        if (block.timestamp >= expiry) revert Expired();
        if (amount > perTxCap) revert PerTxCapExceeded(amount, perTxCap);

        uint256 dayIdx = block.timestamp / 1 days;
        if (dayIdx != currentDayIndex) {
            spentToday = 0;
            currentDayIndex = dayIdx;
        }

        if (spentToday + amount > dailyCap) revert DailyCapExceeded(spentToday + amount, spentToday, dailyCap);

        spentToday += amount;

        IERC20(token).safeTransferFrom(owner, to, amount);

        emit Spent(to, amount, spentToday);
    }

    /**
     * @notice Updates per-transaction cap, daily cap, and expiry.
     * @param perTxCap_ New per-transaction cap.
     * @param dailyCap_ New daily cap.
     * @param expiry_ New expiry timestamp.
     */
    function setLimits(uint256 perTxCap_, uint256 dailyCap_, uint256 expiry_) external onlyOwner {
        if (perTxCap_ == 0 || dailyCap_ == 0 || dailyCap_ < perTxCap_) {
            revert InvalidLimits();
        }
        if (expiry_ <= block.timestamp) revert Expired();

        perTxCap = perTxCap_;
        dailyCap = dailyCap_;
        expiry = expiry_;

        emit LimitsUpdated(perTxCap_, dailyCap_, expiry_);
    }

    /**
     * @notice Pauses spending.
     */
    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    /**
     * @notice Unpauses spending.
     */
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    /**
     * @notice Returns remaining spendable amount for the current day window.
     * @return Remaining daily allowance.
     */
    function remainingToday() external view returns (uint256) {
        uint256 dayIdx = block.timestamp / 1 days;
        if (dayIdx != currentDayIndex) {
            return dailyCap;
        }

        return spentToday >= dailyCap ? 0 : dailyCap - spentToday;
    }
}
