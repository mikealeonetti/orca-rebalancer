import { DecimalUtil } from "@orca-so/common-sdk";
import { PDAUtil, PositionData, TickArrayData, TickArrayUtil, TokenInfo, Whirlpool, collectFeesQuote } from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";
import { ctx } from "./solana";

import Debug from 'debug';

const debug = Debug("rebalancer:calculateFees");

export interface Fees {
    tokenA : Decimal;
    tokenB : Decimal;
}

export default async function (position: PositionData, whirlpool : Whirlpool, tokenA : TokenInfo, tokenB : TokenInfo ) : Promise<Fees> {
    // Get the position and the pool to which the position belongs
    //const whirlpool = await client.getPool(position.position.whirlpool);

    // Get TickArray and Tick
    const tick_spacing = whirlpool.getData().tickSpacing;
    const tick_array_lower_pubkey = PDAUtil.getTickArrayFromTickIndex(position.tickLowerIndex, tick_spacing, position.whirlpool, ctx.program.programId).publicKey;
    const tick_array_upper_pubkey = PDAUtil.getTickArrayFromTickIndex(position.tickUpperIndex, tick_spacing, position.whirlpool, ctx.program.programId).publicKey;
    const tick_array_lower = await ctx.fetcher.getTickArray(tick_array_lower_pubkey) as TickArrayData;
    const tick_array_upper = await ctx.fetcher.getTickArray(tick_array_upper_pubkey) as TickArrayData;
    const tick_lower = TickArrayUtil.getTickFromArray(tick_array_lower, position.tickLowerIndex, tick_spacing);
    const tick_upper = TickArrayUtil.getTickFromArray(tick_array_upper, position.tickUpperIndex, tick_spacing);

    // Get trade fee
    const quote_fee = await collectFeesQuote({
        whirlpool: whirlpool.getData(),
        position: position,
        tickLower: tick_lower,
        tickUpper: tick_upper
    });

    debug("quote_fee quote_fee.feeOwedA=%s, quote_fee.feeOwedB=%s", quote_fee.feeOwedA, quote_fee.feeOwedB);

    const fees : Fees = {
        tokenA : DecimalUtil.adjustDecimals(new Decimal(quote_fee.feeOwedA.toString()), tokenA.decimals),
        tokenB : DecimalUtil.adjustDecimals(new Decimal(quote_fee.feeOwedB.toString()), tokenB.decimals)
    };

    debug("fees", fees );

    return( fees );
}