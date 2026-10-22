// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {AgentAllowance} from "../AgentAllowance.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

contract AgentAllowanceTest is Test {
    // ─── fixtures ──────────────────────────────────────────────────────────────
    AgentAllowance internal aa;
    MockERC20      internal usdc;

    address internal owner  = address(1);
    address internal agent  = address(2);
    address internal seller = address(3);

    uint256 internal constant PER_TX_CAP = 100e6;
    uint256 internal constant DAILY_CAP  = 500e6;
    uint256 internal          EXPIRY;          // set in setUp (dynamic)

    // ─── setUp ─────────────────────────────────────────────────────────────────
    function setUp() public {
        // Deploy mock token and give owner a fat balance.
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        usdc.mint(owner, 1_000_000e6);

        EXPIRY = block.timestamp + 30 days;

        // Deploy the contract under test.
        aa = new AgentAllowance(owner, agent, address(usdc), PER_TX_CAP, DAILY_CAP, EXPIRY);

        // Owner approves the contract for max, so it can pull via transferFrom.
        vm.prank(owner);
        usdc.approve(address(aa), type(uint256).max);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. Happy path – spend()
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Spend_HappyPath() public {
        uint256 amount       = 50e6;
        uint256 ownerBefore  = usdc.balanceOf(owner);
        uint256 sellerBefore = usdc.balanceOf(seller);

        // Expect the Spent event.
        vm.expectEmit(true, false, false, true, address(aa));
        emit AgentAllowance.Spent(seller, amount, amount);

        vm.prank(agent);
        aa.spend(seller, amount);

        // Funds moved correctly.
        assertEq(usdc.balanceOf(owner),  ownerBefore  - amount, "owner balance should decrease");
        assertEq(usdc.balanceOf(seller), sellerBefore + amount, "seller balance should increase");

        // spentToday updated.
        assertEq(aa.spentToday(), amount, "spentToday should equal amount");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. Per-tx cap exceeded
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Revert_Spend_PerTxCapExceeded() public {
        uint256 over = PER_TX_CAP + 1;

        vm.expectRevert(
            abi.encodeWithSelector(AgentAllowance.PerTxCapExceeded.selector, over, PER_TX_CAP)
        );
        vm.prank(agent);
        aa.spend(seller, over);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. Daily cap exceeded
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Revert_Spend_DailyCapExceeded() public {
        // Each tx is PER_TX_CAP (100e6). Five fills the daily cap exactly (500e6).
        vm.startPrank(agent);
        for (uint256 i = 0; i < 5; i++) {
            aa.spend(seller, PER_TX_CAP);
        }
        // The sixth would push cumulative to 600e6 > dailyCap=500e6.
        uint256 attempted   = DAILY_CAP + PER_TX_CAP;   // spentToday(500) + amount(100)
        uint256 spentSoFar  = DAILY_CAP;

        vm.expectRevert(
            abi.encodeWithSelector(
                AgentAllowance.DailyCapExceeded.selector,
                attempted,
                spentSoFar,
                DAILY_CAP
            )
        );
        aa.spend(seller, PER_TX_CAP);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. Daily cap resets on the next day
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Spend_DailyCapResetsNextDay() public {
        // Drain the daily cap completely.
        vm.startPrank(agent);
        for (uint256 i = 0; i < 5; i++) {
            aa.spend(seller, PER_TX_CAP);
        }
        vm.stopPrank();

        assertEq(aa.spentToday(), DAILY_CAP, "spentToday should be dailyCap after draining");

        // Advance by more than one full day so the day index rolls over.
        vm.warp(block.timestamp + 1 days + 1);

        // Should succeed again.
        vm.prank(agent);
        aa.spend(seller, PER_TX_CAP);

        assertEq(aa.spentToday(), PER_TX_CAP, "spentToday should reset after day rollover");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. Expired
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Revert_Spend_Expired() public {
        // Advance past expiry.
        vm.warp(EXPIRY + 1);

        vm.expectRevert(AgentAllowance.Expired.selector);
        vm.prank(agent);
        aa.spend(seller, 1e6);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. Paused / unpaused
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Revert_Spend_WhenPaused() public {
        vm.prank(owner);
        aa.pause();

        assertTrue(aa.paused(), "should be paused");

        vm.expectRevert(AgentAllowance.ContractPaused.selector);
        vm.prank(agent);
        aa.spend(seller, 1e6);
    }

    function test_Spend_SucceedsAfterUnpause() public {
        // Pause then unpause.
        vm.prank(owner);
        aa.pause();

        vm.prank(owner);
        aa.unpause();

        assertFalse(aa.paused(), "should not be paused after unpause");

        // spend must succeed.
        vm.prank(agent);
        aa.spend(seller, 1e6);

        assertEq(aa.spentToday(), 1e6, "spentToday should reflect spend after unpause");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. Non-agent caller
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Revert_Spend_NonAgent() public {
        address rando = makeAddr("rando");

        vm.expectRevert(
            abi.encodeWithSelector(AgentAllowance.NotAgent.selector, rando, agent)
        );
        vm.prank(rando);
        aa.spend(seller, 1e6);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. Only owner can call setLimits
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Revert_SetLimits_NonOwner() public {
        address rando = makeAddr("rando");

        vm.expectRevert(AgentAllowance.NotOwner.selector);
        vm.prank(rando);
        aa.setLimits(PER_TX_CAP, DAILY_CAP, EXPIRY);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. Only owner can call pause/unpause
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Revert_Pause_NonOwner() public {
        address rando = makeAddr("rando");

        vm.expectRevert(AgentAllowance.NotOwner.selector);
        vm.prank(rando);
        aa.pause();
    }

    function test_Revert_Unpause_NonOwner() public {
        // First pause legitimately so unpause has something to do.
        vm.prank(owner);
        aa.pause();

        address rando = makeAddr("rando");

        vm.expectRevert(AgentAllowance.NotOwner.selector);
        vm.prank(rando);
        aa.unpause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. setLimits updates state and emits LimitsUpdated
    // ═══════════════════════════════════════════════════════════════════════════
    function test_SetLimits_UpdatesStateAndEmitsEvent() public {
        uint256 newPerTx  = 200e6;
        uint256 newDaily  = 1_000e6;
        uint256 newExpiry = block.timestamp + 60 days;

        vm.expectEmit(false, false, false, true, address(aa));
        emit AgentAllowance.LimitsUpdated(newPerTx, newDaily, newExpiry);

        vm.prank(owner);
        aa.setLimits(newPerTx, newDaily, newExpiry);

        assertEq(aa.perTxCap(), newPerTx,  "perTxCap should be updated");
        assertEq(aa.dailyCap(), newDaily,  "dailyCap should be updated");
        assertEq(aa.expiry(),   newExpiry, "expiry should be updated");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 11. remainingToday()
    // ═══════════════════════════════════════════════════════════════════════════
    function test_RemainingToday_FreshDay() public view {
        // Nothing spent yet → full daily cap.
        assertEq(aa.remainingToday(), DAILY_CAP, "fresh day should return dailyCap");
    }

    function test_RemainingToday_DecreasesAfterSpend() public {
        uint256 amount = 75e6;
        vm.prank(agent);
        aa.spend(seller, amount);

        assertEq(aa.remainingToday(), DAILY_CAP - amount, "remaining should decrease after spend");
    }

    function test_RemainingToday_ResetsAfterWarp() public {
        // Drain fully.
        vm.startPrank(agent);
        for (uint256 i = 0; i < 5; i++) {
            aa.spend(seller, PER_TX_CAP);
        }
        vm.stopPrank();

        assertEq(aa.remainingToday(), 0, "remaining should be 0 after daily cap exhausted");

        // Warp forward one full day.
        vm.warp(block.timestamp + 1 days + 1);

        // remainingToday reads the new dayIdx and returns full dailyCap.
        assertEq(aa.remainingToday(), DAILY_CAP, "remaining should reset to dailyCap after day warp");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Bonus: pause() emits Paused, unpause() emits Unpaused
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Pause_EmitsPaused() public {
        vm.expectEmit(false, false, false, false, address(aa));
        emit AgentAllowance.Paused();

        vm.prank(owner);
        aa.pause();
    }

    function test_Unpause_EmitsUnpaused() public {
        vm.prank(owner);
        aa.pause();

        vm.expectEmit(false, false, false, false, address(aa));
        emit AgentAllowance.Unpaused();

        vm.prank(owner);
        aa.unpause();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Bonus: deployment / initialization
    // ═══════════════════════════════════════════════════════════════════════════
    function test_Deploy_SetsImmutables() public view {
        assertEq(aa.owner(),     owner,          "owner mismatch");
        assertEq(aa.agent(),     agent,          "agent mismatch");
        assertEq(aa.token(),     address(usdc),  "token mismatch");
        assertEq(aa.perTxCap(),  PER_TX_CAP,     "perTxCap mismatch");
        assertEq(aa.dailyCap(),  DAILY_CAP,      "dailyCap mismatch");
        assertEq(aa.expiry(),    EXPIRY,         "expiry mismatch");
        assertFalse(aa.paused(), "should not be paused at deploy");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 12. Fuzz: amount vs perTxCap boundary
    // ═══════════════════════════════════════════════════════════════════════════

    /// @dev Amounts ≤ perTxCap and ≤ dailyCap must succeed (no revert).
    function testFuzz_Spend_WithinPerTxCap(uint256 amount) public {
        // Bound to valid range: 1 wei … PER_TX_CAP
        amount = bound(amount, 1, PER_TX_CAP);

        // Make sure owner has enough and allowance is in place (already set in setUp).
        vm.prank(agent);
        aa.spend(seller, amount);

        assertEq(aa.spentToday(), amount, "spentToday should equal fuzzed amount");
    }

    /// @dev Amounts strictly above perTxCap must revert with PerTxCapExceeded.
    function testFuzz_Spend_AbovePerTxCap_Reverts(uint256 amount) public {
        // Bound to: PER_TX_CAP+1 … type(uint256).max (but keep it below uint248 to avoid overflow edge cases)
        amount = bound(amount, PER_TX_CAP + 1, type(uint128).max);

        vm.expectRevert(
            abi.encodeWithSelector(AgentAllowance.PerTxCapExceeded.selector, amount, PER_TX_CAP)
        );
        vm.prank(agent);
        aa.spend(seller, amount);
    }
}
