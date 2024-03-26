import { DecimalUtil } from "@orca-so/common-sdk";
import { IGNORE_CACHE, ORCA_WHIRLPOOL_PROGRAM_ID, PDAUtil, PriceMath, TickUtil, TokenInfo, increaseLiquidityQuoteByInputTokenUsingPriceSlippage, swapQuoteByInputToken } from "@orca-so/whirlpools-sdk";
import { PublicKey } from "@solana/web3.js";
import Debug from 'debug';
import Decimal from "decimal.js";
import { find, round } from "lodash";
import { DEPOSIT_SLIPPAGE, GAS_TO_SAVE, OPEN_POSITION_FEE, RANGE_PERCENT, SOLANA, SWAP_SLIPPAGE, USDC, WANTED_TICK_SPACING, WHIRLPOOLS_CONFIG } from "./constants";
import { DBWhirlpool, DBWhirlpoolHistory } from "./database";
import getPositions, { WhirlpoolPositionInfo } from "./getPositions";
import getTokenBalance from "./getTokenBalance";
import { heliusAddPriorityFeeToTxBuilder } from "./heliusPriority";
import logger from "./logger";
import { getTokenHoldings } from "./propertiesHelper";
import { client, ctx } from "./solana";
import util from 'util';
import { alertViaTelegram } from "./telegram";

const debug = Debug("rebalancer:openPosition");

async function getSpendableAmounts(token_a: TokenInfo, token_b: TokenInfo): Promise<[Decimal, Decimal]> {
    return await Promise.all([token_a, token_b].map(async (token: TokenInfo): Promise<Decimal> => {
        const isSolana = token.mint.equals(SOLANA.mint);

        // The amount
        let spendableAmount: Decimal;

        if (isSolana) {
            const solInWallet = await ctx.connection.getBalance(ctx.wallet.publicKey);

            // Convert to decimal
            spendableAmount = DecimalUtil.fromNumber(solInWallet, SOLANA.decimals);

            debug("Solana spendable before %s, solinWallet=%s", spendableAmount, solInWallet);

            // Remove the amount we need for gas
            spendableAmount = spendableAmount.minus(GAS_TO_SAVE);
        }
        else {
            // Get the balance of the other token
            spendableAmount = await getTokenBalance(token.mint);

            debug("USDC spendable before %s", spendableAmount);
        }

        // Adjust with holdings
        const holdings = await getTokenHoldings(token);

        // Subtract it
        spendableAmount = spendableAmount.minus(holdings);

        // But we can't have deficits here.
        return Decimal.max(0, spendableAmount);
    })) as [Decimal, Decimal];
}

export default async function (position?: WhirlpoolPositionInfo): Promise<void> {
    const hasPreviousPosition = position != null;
    let whirlpool_pubkey: PublicKey;


    if (hasPreviousPosition) {
        whirlpool_pubkey = position.position.whirlpool;
    }
    else {
        // Whirlpools are identified by 5 elements (Program, Config, mint address of the 1st token,
        // mint address of the 2nd token, tick spacing), similar to the 5 column compound primary key in DB
        whirlpool_pubkey = PDAUtil.getWhirlpool(
            ORCA_WHIRLPOOL_PROGRAM_ID,
            WHIRLPOOLS_CONFIG,
            SOLANA.mint,
            USDC.mint,
            WANTED_TICK_SPACING).publicKey;
    }


    debug("whirlpool_key: %s", whirlpool_pubkey);

    const whirlpool = await client.getPool(whirlpool_pubkey, IGNORE_CACHE);

    // Adjust price range (not all prices can be set, only a limited number of prices are available for range specification)
    // (prices corresponding to InitializableTickIndex are available)
    const whirlpool_data = whirlpool.getData();
    const token_a = whirlpool.getTokenAInfo();
    const token_b = whirlpool.getTokenBInfo();

    // Shared variables
    let lower_tick_index: number;
    let upper_tick_index: number;

    // Get the current price of the pool
    let sqrt_price_x64 = whirlpool.getData().sqrtPrice;
    let price = PriceMath.sqrtPriceX64ToPrice(sqrt_price_x64, SOLANA.decimals, USDC.decimals);

    debug("price:", price.toFixed(USDC.decimals));

    // Do we have a previous position?
    if (hasPreviousPosition) {
        lower_tick_index = position.position.tickLowerIndex;
        upper_tick_index = position.position.tickUpperIndex;

        logger.info("Increasing position.");
    }
    else {
        const { tickCurrentIndex } = whirlpool.getData();

        // Get percent above and below
        /*
        const halfPercent =  tickCurrentIndexDecimal // price
            // Price multiplied by the range
            .times(RANGE_PERCENT)
            // Divided by 100
            .div(100)
            // Now halved
            .div(2);
            */
        const halfPercent = Math.abs(tickCurrentIndex * RANGE_PERCENT / 100 / 2);

        // Set price range, amount of tokens to deposit, and acceptable slippage
        //const lower_price = price.minus(halfPercent);
        //const upper_price = price.plus(halfPercent);
        const lower_tick = round(tickCurrentIndex - halfPercent);
        const upper_tick = round(tickCurrentIndex + halfPercent);

        debug("lower_tick=%s, upper_tick=%s, halfPercent=%s, tickCurrentIndex=%s", lower_tick, upper_tick, halfPercent, tickCurrentIndex);

        //const dev_usdc_amount = DecimalUtil.toBN(new Decimal("22.34" /* devUSDC */), USDC.decimals);

        lower_tick_index = TickUtil.getInitializableTickIndex(lower_tick, whirlpool_data.tickSpacing);
        upper_tick_index = TickUtil.getInitializableTickIndex(upper_tick, whirlpool_data.tickSpacing);
        //const lower_tick_index = PriceMath.priceToInitializableTickIndex(lower_price, token_a.decimals, token_b.decimals, whirlpool_data.tickSpacing);
        //const upper_tick_index = PriceMath.priceToInitializableTickIndex(upper_price, token_a.decimals, token_b.decimals, whirlpool_data.tickSpacing);
        const lower_price = PriceMath.tickIndexToPrice(lower_tick_index, token_a.decimals, token_b.decimals);
        const upper_price = PriceMath.tickIndexToPrice(upper_tick_index, token_a.decimals, token_b.decimals);
        debug("lower & upper tick_index:", lower_tick_index, upper_tick_index);
        debug("lower & upper price:",
            PriceMath.tickIndexToPrice(lower_tick_index, token_a.decimals, token_b.decimals).toFixed(token_b.decimals),
            PriceMath.tickIndexToPrice(upper_tick_index, token_a.decimals, token_b.decimals).toFixed(token_b.decimals)
        );

        logger.info("Opening position at price %s, upper=%s, lower=%s", price, lower_price, upper_price);
    }

    // Get the token amounts
    let spendableAmounts = await getSpendableAmounts(token_a, token_b);

    // Get the total price in the wallet
    //let totalPriceSpendable = spendableAmounts[0].times(price).plus(spendableAmounts[1]);

    //debug("totalPrice that's spendable=", totalPriceSpendable);

    const tokensToTest = new Decimal(100);

    // Get the quote
    let increaseLiquidityQuote = increaseLiquidityQuoteByInputTokenUsingPriceSlippage(
        // inputTokenMint - The mint of the input token the user would like to deposit.
        token_b.mint,
        //inputTokenAmount - The amount of input tokens to deposit.
        tokensToTest, // Some fixed price
        // tickLower - The lower index of the position that we are depositing into.
        lower_tick_index,
        // tickUpper - The upper index of the position that we are depositing into.
        upper_tick_index,
        // slippageTolerance - The maximum slippage allowed when calculating the minimum tokens received.
        DEPOSIT_SLIPPAGE,
        // whirlpool - A Whirlpool helper class to help interact with the Whirlpool account.
        whirlpool
    );

    const estInputA = DecimalUtil.fromBN(increaseLiquidityQuote.tokenEstA, token_a.decimals);
    const estInputB = DecimalUtil.fromBN(increaseLiquidityQuote.tokenEstB, token_b.decimals);
    const estMaxA = DecimalUtil.fromBN(increaseLiquidityQuote.tokenMaxA, token_a.decimals);
    const estMaxB = DecimalUtil.fromBN(increaseLiquidityQuote.tokenMaxB, token_b.decimals);

    // Get the total price of what the estimated would be
    const estMaxATimesPrice = estMaxA.times(price);
    const totalPriceOfAandB = estMaxATimesPrice.plus(estMaxB);

    // Get what percent of the price is A
    const theTotalPercentOfA = estMaxATimesPrice.div(totalPriceOfAandB);

    // Get the price with the shift
    //const estimatedRatioPriceForPool = estMaxB.div(estMaxA);
    //const ratioBPerA = estMaxA.div(estMaxB);

    debug("estMaxATimesPrice=%s\n totalPriceOfAandB=%s, theTotalPercentOfA=%s", estMaxATimesPrice, totalPriceOfAandB, theTotalPercentOfA);

    // Get the total estimated
    const totalPriceSpendable = spendableAmounts[0].times(price).plus(spendableAmounts[1]);
    //const changedTotalPrice = spendableAmounts[0].times(estimatedRatioPriceForPool).plus(spendableAmounts[1]);
    //const percentOfB = estInputB.div(estInputA.times(estimatedRatioPriceForPool).plus(estInputB));

    debug("totalPriceSpendable=%s", totalPriceSpendable);

    /*
    sqrt_price_x64 = ( await whirlpool.refreshData() ).sqrtPrice;
    price = PriceMath.sqrtPriceX64ToPrice(sqrt_price_x64, SOLANA.decimals, USDC.decimals);
 
    totalPriceSpendable = spendableAmounts[0].times(price).plus(spendableAmounts[1]);
    */

    // Now apply the ratio
    const amountOfAOfPrice = totalPriceSpendable.times(theTotalPercentOfA);
    const amountOfA = amountOfAOfPrice.div(price);
    const amountOfB = totalPriceSpendable.minus(amountOfAOfPrice);

    debug("amountOfAOfPrice=%s", amountOfAOfPrice);

    // How much more they want
    const percentForMaximum = estMaxB.minus(estInputB).div(estInputB).plus(1);

    debug("amountOfA=%s\n amountOfB=%s\n percentForMaximum=%s\n spendableA=%s\n spendableB=%s.",
        amountOfA,
        amountOfB,
        percentForMaximum,
        spendableAmounts[0],
        spendableAmounts[1],
    );

    // Output the estimation
    debug("tokenA max input:", estMaxA.toFixed(token_a.decimals));
    debug("tokenB max input:", estMaxB.toFixed(token_b.decimals));
    debug("tokenA est input:", estInputA.toFixed(token_a.decimals));
    debug("tokenB est input:", estInputB.toFixed(token_b.decimals));

    // How much more we need of each token
    const amountNeededOfA = amountOfA.minus(spendableAmounts[0]);
    const amountNeededOfB = amountOfB.minus(spendableAmounts[1]);

    debug("amountNeededOfA=%s, amountNeededOfB=%s", amountNeededOfA, amountNeededOfB);

    let amountToSwapOut: Decimal | null = null;
    let tokenToSwapFrom: TokenInfo | null = null;
    let tokenToQuote: TokenInfo = token_b;
    let amountToIncrease: Decimal = spendableAmounts[1];

    // Do we have enough of one token or the other?
    if (amountNeededOfA.gt(0)) {
        amountToSwapOut = amountNeededOfA.times(price);
        tokenToSwapFrom = token_b;
        tokenToQuote = token_a;
    }
    else if (amountNeededOfB.gt(0)) {
        amountToSwapOut = amountNeededOfB.div(price);
        tokenToSwapFrom = token_a;
        tokenToQuote = token_b;
    }

    debug("Want to swap %s of token [%s] to balance.", amountToSwapOut, tokenToSwapFrom?.mint, tokenToSwapFrom);

    // If we are re-depositing, the position was already opened
    let tokenAFees = new Decimal(hasPreviousPosition ? 0 : OPEN_POSITION_FEE);
    let tokenBFees = new Decimal(0);
    let totalSpentUSDC: Decimal = tokenAFees.times(price).plus(tokenBFees);

    if (tokenToSwapFrom != null) {
        logger.info("Swapping %s of token [%s] to balance.", amountToSwapOut, tokenToSwapFrom.mint);

        // Obtain swap estimation (run simulation)
        const swapQuote = await swapQuoteByInputToken(
            whirlpool,
            // Input token and amount
            tokenToSwapFrom.mint,
            DecimalUtil.toBN(amountToSwapOut!, tokenToSwapFrom.decimals),
            // Acceptable slippage (10/1000 = 1%)
            SWAP_SLIPPAGE,
            ctx.program.programId,
            ctx.fetcher,
            IGNORE_CACHE,
        );

        debug("estimatedAmountIn=%s", DecimalUtil.fromBN(swapQuote.estimatedAmountIn, 9));
        debug("estimatedAmountOut=%s", DecimalUtil.fromBN(swapQuote.estimatedAmountOut, 6));

        debug("estiamtedFeeAmount=%s", swapQuote.estimatedFeeAmount);

        // Send the transaction
        const tx = await whirlpool.swap(swapQuote);

        // Add the priority
        await heliusAddPriorityFeeToTxBuilder(tx);

        const signature = await tx.buildAndExecute();
        debug("signature:", signature);

        // Wait for the transaction to complete
        const latest_blockhash = await ctx.connection.getLatestBlockhash();
        await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");

        logger.info("Swap complete.");

        // Get the spendable amounts again
        spendableAmounts = await getSpendableAmounts(token_a, token_b);

        if (amountNeededOfA.gt(0)) {
            // We swapped from USDC
            amountToIncrease = spendableAmounts[0];
            const spentTokenB = DecimalUtil.fromBN(swapQuote.estimatedFeeAmount, token_b.decimals);

            tokenBFees = tokenBFees.plus(spentTokenB);
            totalSpentUSDC = totalSpentUSDC.plus(spentTokenB);
        }
        else if (amountNeededOfB.gt(0)) {
            // We swapped from SOL
            amountToIncrease = spendableAmounts[1];

            const spentTokenA = DecimalUtil.fromBN(swapQuote.estimatedFeeAmount, token_a.decimals);
            tokenBFees = tokenBFees.plus(spentTokenA);
            totalSpentUSDC = totalSpentUSDC.plus(spentTokenA.times(price));
        }

    }

    let adjustedAmountToIncrease = amountToIncrease.div(percentForMaximum);

    debug("adjustedAmountToIncrease=", adjustedAmountToIncrease);

    // We don't have enough
    if (adjustedAmountToIncrease.lte(0)) {
        logger.warn("Not going to increase liquidity because [%s] balance is %s.", tokenToQuote.mint, adjustedAmountToIncrease);
        return;
    }

    // Wait a tick
    //await Bluebird.delay( 1000 );

    while (true) {
        // Get an actual quote
        increaseLiquidityQuote = increaseLiquidityQuoteByInputTokenUsingPriceSlippage(
            // inputTokenMint - The mint of the input token the user would like to deposit.
            tokenToQuote.mint,
            //inputTokenAmount - The amount of input tokens to deposit.
            adjustedAmountToIncrease,
            // tickLower - The lower index of the position that we are depositing into.
            lower_tick_index,
            // tickUpper - The upper index of the position that we are depositing into.
            upper_tick_index,
            // slippageTolerance - The maximum slippage allowed when calculating the minimum tokens received.
            DEPOSIT_SLIPPAGE,
            // whirlpool - A Whirlpool helper class to help interact with the Whirlpool account.
            whirlpool
        );

        debug("second increaseLiquidityQuote=", increaseLiquidityQuote);

        const newMaxA = DecimalUtil.fromBN(increaseLiquidityQuote.tokenMaxA, token_a.decimals);
        const newMaxB = DecimalUtil.fromBN(increaseLiquidityQuote.tokenMaxB, token_b.decimals);
        const newEstA = DecimalUtil.fromBN(increaseLiquidityQuote.tokenEstA, token_a.decimals);
        const newEstB = DecimalUtil.fromBN(increaseLiquidityQuote.tokenEstB, token_b.decimals);

        debug("revised tokenA max input:", newMaxA.toFixed(token_a.decimals));
        debug("revised tokenB max input:", newMaxB.toFixed(token_b.decimals));
        debug("revised tokenA est input:", newEstA.toFixed(token_a.decimals));
        debug("revised tokenB est input:", newEstB.toFixed(token_b.decimals));

        // Do we have to adjust and loop again?
        const percentOverA = newMaxA.minus(spendableAmounts[0]).div(spendableAmounts[0]);
        const percentOverB = newMaxB.minus(spendableAmounts[1]).div(spendableAmounts[1]);
        //const percentOverA = newEstA.minus( spendableAmounts[0] ).div( spendableAmounts[0] );
        //const percentOverB = newEstB.minus( spendableAmounts[1] ).div( spendableAmounts[1] );

        // Get the maximum percent over
        const maxPercentOver = Decimal.max(percentOverA, percentOverB);

        debug("percentOverA=%s\n percentOverB=%s\n maxPercentOver=%s", percentOverA, percentOverB, maxPercentOver);

        // If a percent if positive then we have to re-adjust
        if (maxPercentOver.lte(0))
            break; // Everything is good

        // Dial down the percent
        adjustedAmountToIncrease = adjustedAmountToIncrease.div(maxPercentOver.plus(1));

        debug("re-adjustedAmountToIncrease=%s", adjustedAmountToIncrease);
    }

    /*
       * @category Quotes
       * @param inputTokenAmount - The amount of input tokens to deposit.
       * @param inputTokenMint - The mint of the input token the user would like to deposit.
       * @param tickLower - The lower index of the position that we are depositing into.
       * @param tickUpper - The upper index of the position that we are depositing into.
       * @param slippageTolerance - The maximum slippage allowed when calculating the minimum tokens received.
       * @param whirlpool - A Whirlpool helper class to help interact with the Whirlpool account.
       * @returns An IncreaseLiquidityInput object detailing the required token amounts & liquidity values to use when calling increase-liquidity-ix.
       */


    if (hasPreviousPosition) {
        // Refetch position
        const positionObject = await client.getPosition(position.publicKey, IGNORE_CACHE);

        // Create a transaction
        const increaseLiquidityTransaction = await positionObject.increaseLiquidity(increaseLiquidityQuote);

        // Add the priority
        await heliusAddPriorityFeeToTxBuilder(increaseLiquidityTransaction);

        // Send the transaction
        const signature = await increaseLiquidityTransaction.buildAndExecute();

        // Wait for the transaction to complete
        const latest_blockhash = await ctx.connection.getLatestBlockhash();
        const rpcResponse = await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");

        debug("rpcResponse=", rpcResponse);

        // Increase the fees
        const [
            dbWhirlpool,
            dbWhirlpoolHistory
        ] = await Promise.all([
            DBWhirlpool.getByPublicKey(position.publicKey),
            DBWhirlpoolHistory.getLatestByPublicKey(position.publicKey)
        ]);

        // update whirlpool
        if (dbWhirlpool) {
            dbWhirlpool.remainingSpentTokenA = new Decimal(dbWhirlpool.remainingSpentTokenA).plus(tokenAFees).toString();
            dbWhirlpool.remainingSpentTokenB = new Decimal(dbWhirlpool.remainingSpentTokenB).plus(tokenBFees).toString();
            await dbWhirlpool.save();
        }
        // update the history
        if (dbWhirlpoolHistory) {
            dbWhirlpoolHistory.totalSpentTokenA = new Decimal(dbWhirlpoolHistory.totalSpentTokenA).plus(tokenAFees).toString();
            dbWhirlpoolHistory.totalSpentTokenB = new Decimal(dbWhirlpoolHistory.totalSpentTokenB).plus(tokenBFees).toString();
            dbWhirlpoolHistory.totalSpentUSDC = new Decimal(dbWhirlpoolHistory.totalSpentUSDC).plus(totalSpentUSDC).toString();
            await dbWhirlpoolHistory.save();
        }

        // Re-get positions
        const newPositions = await getPositions();

        // Now get the new position
        const newPosition = newPositions.find(p => p.publicKey.equals(position.publicKey));

        if (newPosition) {

            // Fee SOL in USDC
            const stakeAmountAPrice = newPosition.amountA.times(newPosition.price);
            const totalStakeValueUSDC = stakeAmountAPrice.plus(newPosition.amountB);

            // Prepare the text
            const text = util.format(`Position Increased [%s]
            
            Price: %s
            Low price: %s (%s%% from current)
            High price: %s (%s%% from current)
            
            Stake total: %s USDC
            SOL amount: %s (%s USDC, %s%%)
            USDC amount: %s (%s%%)`,
                newPosition.publicKey,

                newPosition.price.toFixed(4),
                newPosition.lowerPrice.toFixed(4), newPosition.price.minus(newPosition.lowerPrice).div(newPosition.price).times(100).toFixed(2),
                newPosition.upperPrice.toFixed(4), newPosition.upperPrice.minus(newPosition.price).div(newPosition.price).times(100).toFixed(2),

                totalStakeValueUSDC.toFixed(2),
                newPosition.amountA, stakeAmountAPrice.toFixed(2), stakeAmountAPrice.div(totalStakeValueUSDC).times(100).toFixed(2),
                newPosition.amountB.toFixed(2), newPosition.amountB.div(totalStakeValueUSDC).times(100).toFixed(2)
            );

            logger.info( "Position increased [%s],", newPosition.publicKey );
        }
    }
    else {
        // Create a transaction
        const open_position_tx = await whirlpool.openPositionWithMetadata(
            lower_tick_index,
            upper_tick_index,
            increaseLiquidityQuote
        );

        // Add the priority
        await heliusAddPriorityFeeToTxBuilder(open_position_tx.tx);

        // Send the transaction
        const signature = await open_position_tx.tx.buildAndExecute();
        debug("signature: %s", signature);
        debug("position NFT: %s", open_position_tx.positionMint);

        // Wait for the transaction to complete
        const latest_blockhash = await ctx.connection.getLatestBlockhash();
        const rpcResponse = await ctx.connection.confirmTransaction({ signature, ...latest_blockhash }, "confirmed");

        debug("rpcResponse=", rpcResponse);

        // Get the position info
        const positionPDA = await PDAUtil.getPosition(ctx.program.programId, open_position_tx.positionMint);

        // Re-get positions
        const newPositions = await getPositions();

        // Now get the new position
        const newPosition = newPositions.find(p => p.publicKey.equals(positionPDA.publicKey));

        debug("Got new position newPosition=", newPosition);

        if (newPosition) {
            // Fee SOL in USDC
            const stakeAmountAPrice = newPosition.amountA.times(newPosition.price);
            const totalStakeValueUSDC = stakeAmountAPrice.plus(newPosition.amountB);

            // Prepare the text
            const text = util.format(`New Position [%s]

Price: %s
Low price: %s (%s%% from current)
High price: %s (%s%% from current)

Stake total: %s USDC
SOL amount: %s (%s USDC, %s%%)
USDC amount: %s (%s%%)`,
                newPosition.publicKey,

                newPosition.price.toFixed(4),
                newPosition.lowerPrice.toFixed(4), newPosition.price.minus(newPosition.lowerPrice).div(newPosition.price).times(100).toFixed(2),
                newPosition.upperPrice.toFixed(4), newPosition.upperPrice.minus(newPosition.price).div(newPosition.price).times(100).toFixed(2),

                totalStakeValueUSDC.toFixed(2),
                newPosition.amountA, stakeAmountAPrice.toFixed(2), stakeAmountAPrice.div(totalStakeValueUSDC).times(100).toFixed(2),
                newPosition.amountB.toFixed(2), newPosition.amountB.div(totalStakeValueUSDC).times(100).toFixed(2)
            );

            // Send a heartbeat
            await alertViaTelegram(text);

            // Save to the DB
            await DBWhirlpool.create({
                publicKey: positionPDA.publicKey.toString(),
                remainingSpentTokenA: tokenAFees.toString(),
                remainingSpentTokenB: tokenBFees.toString(),
                previousPrice: newPosition.price.toString()
            });
            await DBWhirlpoolHistory.create({
                publicKey: positionPDA.publicKey.toString(),
                totalSpentTokenA: tokenAFees.toString(),
                totalSpentTokenB: tokenBFees.toString(),
                totalSpentUSDC: totalSpentUSDC.toString(),
                enteredPriceUSDC: totalStakeValueUSDC.toString()
            });

            logger.info( "Position opened [%s],", newPosition.publicKey );
        }
    }

}

function abs(arg0: number) {
    throw new Error("Function not implemented.");
}
