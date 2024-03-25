import { PDAUtil, PoolUtil, WhirlpoolIx, decreaseLiquidityQuoteByLiquidityWithParams } from "@orca-so/whirlpools-sdk";
import { DBWhirlpool, DBWhirlpoolHistory } from "./database";
import { WhirlpoolPositionInfo } from "./getPositions";
import { client, ctx } from "./solana";
import { DecimalUtil, EMPTY_INSTRUCTION, Instruction, TransactionBuilder, resolveOrCreateATA } from "@orca-so/common-sdk";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { OPEN_POSITION_FEE, SOLANA, TAKE_PROFIT_PERCENT, WITHDRAW_SLIPPAGE } from "./constants";
import Debug from 'debug';
import logger from "./logger";
import Decimal from "decimal.js";
import { incrementTokenHoldings } from "./propertiesHelper";
import { heliusAddPriorityFeeToTxBuilder } from "./heliusPriority";
import { alertViaTelegram } from "./telegram";
import util from 'util';

const debug = Debug("closePosition");

export default async function (position: WhirlpoolPositionInfo, dbWhirlpool: DBWhirlpool): Promise<boolean> {
    debug("closePosition", position, dbWhirlpool);

    try {

        // Get the position and the pool to which the position belongs
        //const position = await client.getPosition(position_pubkey);
        const position_owner = ctx.wallet.publicKey;
        const position_token_account = getAssociatedTokenAddressSync(position.position.positionMint, position_owner);
        //const whirlpool_pubkey = position.getData().whirlpool;


        const whirlpool = await client.getPool(position.position.whirlpool);
        const whirlpoolData = whirlpool.getData();

        const token_a = whirlpool.getTokenAInfo();
        const token_b = whirlpool.getTokenBInfo();

        // Get TickArray and Tick
        const tick_spacing = whirlpoolData.tickSpacing;
        const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.position.tickLowerIndex,
            tick_spacing,
            position.position.whirlpool,
            ctx.program.programId).publicKey;
        const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.position.tickUpperIndex,
            tick_spacing,
            position.position.whirlpool,
            ctx.program.programId).publicKey;

        // Create token accounts to receive fees and rewards
        // Collect mint addresses of tokens to receive
        const tokens_to_be_collected = new Set<string>();
        tokens_to_be_collected.add(position.tokenA.mint.toBase58());
        tokens_to_be_collected.add(position.tokenB.mint.toBase58());

        whirlpoolData.rewardInfos.map((reward_info) => {
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
                tokenOwnerAccountA: token_account_map.get(token_a.mint.toBase58()) as PublicKey,
                tokenOwnerAccountB: token_account_map.get(token_b.mint.toBase58()) as PublicKey,
                tokenVaultA: whirlpool.getData().tokenVaultA,
                tokenVaultB: whirlpool.getData().tokenVaultB,
            }
        );

        // Build the instructions to collect rewards
        const collect_reward_ix = [EMPTY_INSTRUCTION, EMPTY_INSTRUCTION, EMPTY_INSTRUCTION];
        for (let i = 0; i < whirlpool.getData().rewardInfos.length; i++) {
            const reward_info = whirlpool.getData().rewardInfos[i];
            if (!PoolUtil.isRewardInitialized(reward_info)) continue;

            collect_reward_ix[i] = WhirlpoolIx.collectRewardIx(
                ctx.program,
                {
                    whirlpool: position.position.whirlpool,
                    position: position.publicKey,
                    positionAuthority: position_owner,
                    positionTokenAccount: position_token_account,
                    rewardIndex: i,
                    rewardOwnerAccount: token_account_map.get(reward_info.mint.toBase58()) as PublicKey,
                    rewardVault: reward_info.vault,
                }
            );
        }

        // Estimate the amount of tokens that can be withdrawn from the position
        const quote = decreaseLiquidityQuoteByLiquidityWithParams({
            // Pass the pool state as is
            sqrtPrice: whirlpoolData.sqrtPrice,
            tickCurrentIndex: whirlpoolData.tickCurrentIndex,
            // Pass the price range of the position as is
            tickLowerIndex: position.position.tickLowerIndex,
            tickUpperIndex: position.position.tickUpperIndex,
            // Liquidity to be withdrawn (All liquidity)
            liquidity: position.liquidity,
            // Acceptable slippage
            slippageTolerance: WITHDRAW_SLIPPAGE,
        });

        // Output the estimation
        debug("tokenA min output:", DecimalUtil.fromBN(quote.tokenMinA, token_a.decimals).toFixed(token_a.decimals));
        debug("tokenB min output:", DecimalUtil.fromBN(quote.tokenMinB, token_b.decimals).toFixed(token_b.decimals));

        // Build the instruction to decrease liquidity
        const decrease_liquidity_ix = WhirlpoolIx.decreaseLiquidityIx(
            ctx.program,
            {
                ...quote,
                whirlpool: position.position.whirlpool,
                position: position.publicKey,
                positionAuthority: position_owner,
                positionTokenAccount: position_token_account,
                tokenOwnerAccountA: token_account_map.get(token_a.mint.toBase58()) as PublicKey,
                tokenOwnerAccountB: token_account_map.get(token_b.mint.toBase58()) as PublicKey,
                tokenVaultA: whirlpool.getData().tokenVaultA,
                tokenVaultB: whirlpool.getData().tokenVaultB,
                tickArrayLower: tick_array_lower_pubkey,
                tickArrayUpper: tick_array_upper_pubkey,
            }
        );

        // Build the instruction to close the position
        const close_position_ix = WhirlpoolIx.closePositionIx(
            ctx.program,
            {
                position: position.publicKey,
                positionAuthority: position_owner,
                positionTokenAccount: position_token_account,
                positionMint: position.position.positionMint,
                receiver: position_owner,
            }
        );

        // Create a transaction and add the instruction
        const tx_builder = new TransactionBuilder(ctx.connection, ctx.wallet);

        await heliusAddPriorityFeeToTxBuilder(tx_builder);

        // Create token accounts
        required_ta_ix.map((ix) => tx_builder.addInstruction(ix));
        tx_builder
            // Update fees and rewards, collect fees, and collect rewards
            .addInstruction(update_fee_and_rewards_ix)
            .addInstruction(collect_fees_ix)
            .addInstruction(collect_reward_ix[0])
            .addInstruction(collect_reward_ix[1])
            .addInstruction(collect_reward_ix[2])
            // Decrease liquidity
            .addInstruction(decrease_liquidity_ix)
            // Close the position
            .addInstruction(close_position_ix);

        // Send the transaction
        const signature = await tx_builder.buildAndExecute();
        debug("signature:", signature);

        // Wait for the transaction to complete
        const latestBlockhash = await ctx.connection.getLatestBlockhash();
        await ctx.connection.confirmTransaction({ signature, ...latestBlockhash }, "confirmed");

        // Get our debits
        const spentTokenA = new Decimal(dbWhirlpool.remainingSpentTokenA);
        const spentTokenB = new Decimal(dbWhirlpool.remainingSpentTokenB);

        // Update the history
        const history = await DBWhirlpoolHistory.findOne({
            where: { publicKey: position.publicKey.toString() },
            order: [["createdAt", "DESC"]]
        });

        // Some calcs for reporting
        const feeSolInUSDC = position.fees.tokenA.times(position.price);
        const totalFeesInUSDC = position.fees.tokenB.plus(feeSolInUSDC);
        const stakeAmountAPrice = position.amountA.times(position.price);
        const totalStakeValueUSDC = stakeAmountAPrice.plus(position.amountB);

        // Set the history
        if (history) {
            history.closed = new Date();
            history.receivedFeesTokenA = (history.receivedFeesTokenA != null ? new Decimal(history.receivedFeesTokenA).plus(position.fees.tokenA) : position.fees.tokenA).toString()
            history.receivedFeesTokenA = (history.receivedFeesTokenB != null ? new Decimal(history.receivedFeesTokenB).plus(position.fees.tokenB) : position.fees.tokenB).toString()
            history.closedPriceUSDC = totalStakeValueUSDC.toString();
            await history.save();
        }

        // The profits
        const profitA = position.fees.tokenA;
        const profitB = position.fees.tokenB;

        debug("before profitA=%s, profitB=%s, spentTokenA=%s, spentTokenB=%s", profitA, profitB, spentTokenA, spentTokenB);

        const profitMinusSpentTokenA = Decimal.max( 0, profitA.minus(spentTokenA) );
        const profitMinusSpentTokenB = Decimal.max( 0, profitB.minus(spentTokenB) );

        debug("profitMinusSpentTokenA=%s, profitMinusSpentTokenB=%s", profitMinusSpentTokenA, profitMinusSpentTokenB);

        const totalProfitA = profitMinusSpentTokenA.times(TAKE_PROFIT_PERCENT.toDecimal()).div(100);
        const totalProfitB = profitMinusSpentTokenB.times(TAKE_PROFIT_PERCENT.toDecimal()).div(100);

        debug("totalProfitA=%s, totalProfitB=%s", totalProfitA, totalProfitB);

        // Add the rewards to our holdings
        await incrementTokenHoldings(totalProfitA, position.tokenA);
        await incrementTokenHoldings(totalProfitB, position.tokenB);

        // Profit in sol
        const totalProfitAInUSDC = totalProfitA.times(position.price);

        // Prepare the text
        const text = util.format(`Closed Position [%s]
        
Opened: %s

Price: %s
Low price: %s (%s%% from current)
High price: %s (%s%% from current)

Fees total: %s USDC (%s%%)
Fees USDC: %s
Fees SOL: %s (%s USDC)

Profits total: %s USDC
Profits USDC: %s
Profits SOL: %s (%s USDC)

Stake total: %s USDC
SOL amount: %s (%s USDC, %s%%)
USDC amount: %s (%s%%)

Last rebalance: %s`,
            position.publicKey, dbWhirlpool.createdAt.toLocaleString(), // Created at???

            position.price.toFixed(4),
            position.lowerPrice.toFixed(4), position.price.minus(position.lowerPrice).div(position.price).times(100).toFixed(2),
            position.upperPrice.toFixed(4), position.upperPrice.minus(position.price).div(position.price).times(100).toFixed(2),

            totalFeesInUSDC.toFixed(2), totalFeesInUSDC.div(totalStakeValueUSDC).times(100).toFixed(2),
            position.fees.tokenB.toFixed(2),
            position.fees.tokenA, feeSolInUSDC.toFixed(2),

            totalProfitAInUSDC.plus(totalProfitB).toFixed(2),
            totalProfitB.toFixed(2),
            totalProfitA, totalProfitAInUSDC,

            totalStakeValueUSDC.toFixed(2),
            position.amountA, stakeAmountAPrice.toFixed(2), stakeAmountAPrice.div(totalStakeValueUSDC).times(100).toFixed(2),
            position.amountB.toFixed(2), position.amountB.div(totalStakeValueUSDC).times(100).toFixed(2),

            dbWhirlpool.lastRewardsCollected ? dbWhirlpool.lastRewardsCollected.toLocaleString() : "Never"
        );

        // Send a heartbeat
        await alertViaTelegram(text);


        // Remove this position from the db
        await dbWhirlpool.destroy();

        logger.info("Position closed [%s]. Fees claimed tokenA=%s, tokenB=%s.", position.publicKey, position.fees.tokenA, position.fees.tokenB);
    }
    catch (e) {
        logger.error("Error closing position [%s].", position.publicKey, e);
        debug("position close error", e);

        return (false);
    }

    return (true);
}