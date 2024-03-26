import { PDAUtil, PoolUtil, WhirlpoolIx } from "@orca-so/whirlpools-sdk";
import { WhirlpoolPositionInfo } from "./getPositions";
import { ctx } from "./solana";
import { EMPTY_INSTRUCTION, Instruction, TransactionBuilder, resolveOrCreateATA } from "@orca-so/common-sdk";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { heliusAddPriorityFeeToTxBuilder } from "./heliusPriority";
import { DBWhirlpool, DBWhirlpoolHistory } from "./database";
import Decimal from "decimal.js";
import util from 'util';

import Debug from 'debug';
import logger from "./logger";
import { alertViaTelegram } from "./telegram";
import { incrementTokenHoldings } from "./propertiesHelper";
import { TAKE_PROFIT_PERCENT } from "./constants";

const debug = Debug("rebalancer:collectFees");

export default async function (position: WhirlpoolPositionInfo): Promise<void> {
    const position_owner = ctx.wallet.publicKey;
    const position_token_account = await getAssociatedTokenAddress(position.position.positionMint, position_owner);

    // Create token accounts to receive fees and rewards
    // Collect mint addresses of tokens to receive
    const tokens_to_be_collected = new Set<string>();
    tokens_to_be_collected.add(position.tokenA.mint.toBase58());
    tokens_to_be_collected.add(position.tokenB.mint.toBase58());

    position.whirlpoolData.rewardInfos.map((reward_info) => {
        if (PoolUtil.isRewardInitialized(reward_info)) {
            tokens_to_be_collected.add(reward_info.mint.toBase58());
        }
    });

    // Get addresses of token accounts and get instructions to create if it does not exist
    const required_ta_ix: Instruction[] = [];

    const token_account_map = new Map<string, PublicKey>();

    for (let mint_b58 of tokens_to_be_collected) {
        const mint = new PublicKey(mint_b58);
        // If present, ix is EMPTY_INSTRUCTION
        const { address, ...ix } = await resolveOrCreateATA(
            ctx.connection,
            position_owner,
            mint,
            () => ctx.fetcher.getAccountRentExempt()
        );
        required_ta_ix.push(ix);
        token_account_map.set(mint_b58, address);
    }

    // Get TickArray and Tick
    const tick_spacing = position.whirlpoolData.tickSpacing;
    const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.position.tickLowerIndex,
        tick_spacing,
        position.position.whirlpool,
        ctx.program.programId).publicKey;
    const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.position.tickUpperIndex,
        tick_spacing,
        position.position.whirlpool,
        ctx.program.programId).publicKey;

    // Build the instruction to update fees and rewards
    let update_fee_and_rewards_ix = WhirlpoolIx.updateFeesAndRewardsIx(
        ctx.program,
        {
            whirlpool: position.position.whirlpool,
            position: position.publicKey,
            tickArrayLower: tick_array_lower_pubkey,
            tickArrayUpper: tick_array_upper_pubkey,
        }
    );

    // Build the instruction to collect fees
    let collect_fees_ix = WhirlpoolIx.collectFeesIx(
        ctx.program,
        {
            whirlpool: position.position.whirlpool,
            position: position.publicKey,
            positionAuthority: position_owner,
            positionTokenAccount: position_token_account,
            tokenOwnerAccountA: token_account_map.get(position.tokenA.mint.toBase58())!,
            tokenOwnerAccountB: token_account_map.get(position.tokenB.mint.toBase58())!,
            tokenVaultA: position.whirlpoolData.tokenVaultA,
            tokenVaultB: position.whirlpoolData.tokenVaultB,
        }
    );

    // Build the instructions to collect rewards
    const collect_reward_ix = [EMPTY_INSTRUCTION, EMPTY_INSTRUCTION, EMPTY_INSTRUCTION];
    for (let i = 0; i < position.whirlpoolData.rewardInfos.length; i++) {
        const reward_info = position.whirlpoolData.rewardInfos[i];
        if (!PoolUtil.isRewardInitialized(reward_info)) continue;

        collect_reward_ix[i] = WhirlpoolIx.collectRewardIx(
            ctx.program,
            {
                whirlpool: position.position.whirlpool,
                position: position.publicKey,
                positionAuthority: position_owner,
                positionTokenAccount: position_token_account,
                rewardIndex: i,
                rewardOwnerAccount: token_account_map.get(reward_info.mint.toBase58())!,
                rewardVault: reward_info.vault,
            }
        );
    }

    // Create a transaction and add the instruction
    const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);

    // Add the gaaas
    await heliusAddPriorityFeeToTxBuilder(tx_builder);

    // Create token accounts
    required_ta_ix.map((ix) => tx_builder.addInstruction(ix));
    // Update fees and rewards, collect fees, and collect rewards
    tx_builder
        .addInstruction(update_fee_and_rewards_ix)
        .addInstruction(collect_fees_ix)
        .addInstruction(collect_reward_ix[0])
        .addInstruction(collect_reward_ix[1])
        .addInstruction(collect_reward_ix[2]);

    // Send the transaction
    const signature = await tx_builder.buildAndExecute();
    console.log("signature:", signature);

    // Wait for the transaction to complete
    const latest_blockhash = await ctx.connection.getLatestBlockhash();
    await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");

    // Shorthand
    const publicKeyString = position.publicKey.toString();

    logger.info("Collected rewards [%s]. tokenA=%s, tokenB=%s.", publicKeyString, position.fees.tokenA, position.fees.tokenB);

    // We successfully claimed these rewards.
    // Tell our souls
    const [
        dbWhirlpoolHistory,
        dbWhirlpool
    ] = await Promise.all([
        DBWhirlpoolHistory.getLatestByPublicKeyString(publicKeyString),
        DBWhirlpool.getByPublicKeyString(publicKeyString)
    ]);

    // Get our debits
    let spentTokenA = new Decimal(0);
    let spentTokenB = new Decimal(0);

    if (dbWhirlpool) {
        // Get our debits
        spentTokenA = new Decimal(dbWhirlpool.remainingSpentTokenA);
        spentTokenB = new Decimal(dbWhirlpool.remainingSpentTokenB);

        debug("before spentTokenA=%s, spentTokenB=%s", spentTokenA, spentTokenB);

        dbWhirlpool.lastRewardsCollected = new Date();

        const tokenAAdjusted = Decimal.max(0, new Decimal(dbWhirlpool.remainingSpentTokenA).minus(position.fees.tokenA));
        const tokenBAdjusted = Decimal.max(0, new Decimal(dbWhirlpool.remainingSpentTokenB).minus(position.fees.tokenB));

        debug("tokenAAdjusted=%s, tokenBAdjusted=%s", tokenAAdjusted, tokenBAdjusted);

        dbWhirlpool.remainingSpentTokenA = tokenAAdjusted.toString();
        dbWhirlpool.remainingSpentTokenB = tokenBAdjusted.toString();

        // Save it
        await dbWhirlpool.save();
    }
    if (dbWhirlpoolHistory) {
        dbWhirlpoolHistory.receivedFeesTokenA = new Decimal(dbWhirlpoolHistory.receivedFeesTokenA || 0).plus(position.fees.tokenA).toString();
        dbWhirlpoolHistory.receivedFeesTokenB = new Decimal(dbWhirlpoolHistory.receivedFeesTokenB || 0).plus(position.fees.tokenB).toString();

        await dbWhirlpoolHistory.save();
    }

    // The profits
    const profitA = position.fees.tokenA;
    const profitB = position.fees.tokenB;

    debug("before profitA=%s, profitB=%s, spentTokenA=%s, spentTokenB=%s", profitA, profitB, spentTokenA, spentTokenB);

    const profitMinusSpentTokenA = Decimal.max(0, profitA.minus(spentTokenA));
    const profitMinusSpentTokenB = Decimal.max(0, profitB.minus(spentTokenB));

    debug("profitMinusSpentTokenA=%s, profitMinusSpentTokenB=%s", profitMinusSpentTokenA, profitMinusSpentTokenB);

    const totalProfitA = profitMinusSpentTokenA.times(TAKE_PROFIT_PERCENT.toDecimal());
    const totalProfitB = profitMinusSpentTokenB.times(TAKE_PROFIT_PERCENT.toDecimal());

    debug("totalProfitA=%s, totalProfitB=%s", totalProfitA, totalProfitB);

    // Add the rewards to our holdings
    await incrementTokenHoldings(totalProfitA, position.tokenA);
    await incrementTokenHoldings(totalProfitB, position.tokenB);

    // Profit in sol
    const totalProfitAInUSDC = totalProfitA.times(position.price);

    // Prepare the text
    const text = util.format(`Claimed rewards [%s]
        
SOL: %s (%s USDC)
USDC: %s

Profits total: %s USDC
Profits USDC: %s
Profits SOL: %s (%s USDC)`,
        publicKeyString,

        position.fees.tokenA, position.fees.tokenA.times(position.price).toFixed(2),
        position.fees.tokenB.toFixed(2),

        totalProfitAInUSDC.plus(totalProfitB).toFixed(2),
        totalProfitB.toFixed(2),
        totalProfitA, totalProfitAInUSDC.toFixed(2),
    );

    // Send a heartbeat
    await alertViaTelegram(text);
}