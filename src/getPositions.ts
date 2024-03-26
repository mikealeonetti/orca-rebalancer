import { BN } from "@coral-xyz/anchor";
import { DecimalUtil } from "@orca-so/common-sdk";
import { IGNORE_CACHE, PDAUtil, PoolUtil, PositionData, PriceMath, TokenInfo, WhirlpoolData } from "@orca-so/whirlpools-sdk";
import { TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import Bluebird from 'bluebird';
import Debug from 'debug';
import Decimal from "decimal.js";
import calculateFees, { Fees } from "./calculateFees";
import { client, ctx } from "./solana";

const debug = Debug("rebalancer:getPositions");

interface WhirlpoolPositionAndPublicKey {
    position: PositionData;
    publicKey: PublicKey;
}

export default async function (): Promise<WhirlpoolPositionInfo[]> {
    // Get all accounts
    const tokenAccounts = (await ctx.connection.getTokenAccountsByOwner(ctx.wallet.publicKey, { programId: TOKEN_PROGRAM_ID })).value;

    // Process each account
    const whirlpoolPositionCandidatePublicKeys = tokenAccounts.map(ta => {
        const parsed = unpackAccount(ta.pubkey, ta.account);

        const pda = PDAUtil.getPosition(ctx.program.programId, parsed.mint);

        // Output candidate info
        debug(
            "TokenAccount:", ta.pubkey.toBase58(),
            "\n  mint:", parsed.mint.toBase58(),
            "\n  amount:", parsed.amount.toString(),
            "\n  pda:", pda.publicKey.toBase58()
        );

        // Returns the address of the Whirlpool position only if the number of tokens is 1 (ignores empty token accounts and non-NFTs)
        return new BN(parsed.amount.toString()).eq(new BN(1)) ? pda.publicKey : undefined;
    })
        .filter(Boolean) as [PublicKey];

    const whirlpoolPositionCandidateDatas = await ctx.fetcher.getPositions(whirlpoolPositionCandidatePublicKeys, IGNORE_CACHE);

    // Leave only addresses with correct data acquisition as position addresses
    const whirlpoolPositions = whirlpoolPositionCandidatePublicKeys.map((publicKey: PublicKey): WhirlpoolPositionAndPublicKey | null => {
        const position = whirlpoolPositionCandidateDatas.get(publicKey.toString());

        if (position == null)
            return (null);

        return ({
            position,
            publicKey
        });
    })
        .filter(Boolean) as WhirlpoolPositionAndPublicKey[];

    debug(whirlpoolPositions);

    // Get the infos
    const infos = await Bluebird.map(whirlpoolPositions, async (positionAndPublicKey): Promise<WhirlpoolPositionInfo> => {
        const {
            position,
            publicKey
        } = positionAndPublicKey;

        // Get the pool
        const pool = await client.getPool(position.whirlpool, IGNORE_CACHE);
        const whirlpoolData = pool.getData();
        const tokenA = pool.getTokenAInfo();
        const tokenB = pool.getTokenBInfo();
        const price = PriceMath.sqrtPriceX64ToPrice(whirlpoolData.sqrtPrice, tokenA.decimals, tokenB.decimals);

        // Upper range
        const lowerPrice = PriceMath.tickIndexToPrice(position.tickLowerIndex, tokenA.decimals, tokenB.decimals);
        const upperPrice = PriceMath.tickIndexToPrice(position.tickUpperIndex, tokenA.decimals, tokenB.decimals);

        // Get the amounts
        const amounts = PoolUtil.getTokenAmountsFromLiquidity(
            position.liquidity,
            pool.getData().sqrtPrice,
            PriceMath.tickIndexToSqrtPriceX64(position.tickLowerIndex),
            PriceMath.tickIndexToSqrtPriceX64(position.tickUpperIndex),
            true
        );

        // Get the rewards
        const fees = await calculateFees( position, pool, tokenA, tokenB );

        debug("amounts=", amounts);

        return ({
            fees,
            publicKey,
            position,
            price,
            tokenA,
            tokenB,
            liquidity: position.liquidity,
            lowerPrice,
            upperPrice,
            amountA: DecimalUtil.fromBN(amounts.tokenA, tokenA.decimals),
            amountB: DecimalUtil.fromBN(amounts.tokenB, tokenB.decimals),
            whirlpoolData
        });
    }, { concurrency: 1 });

    return infos;
}

export interface WhirlpoolPositionInfo {
    publicKey: PublicKey;
    position: PositionData;
    price: Decimal;
    tokenA: TokenInfo;
    tokenB: TokenInfo;
    liquidity: BN;
    lowerPrice: Decimal;
    upperPrice: Decimal;
    amountA: Decimal;
    amountB: Decimal;
    fees : Fees;
    whirlpoolData : WhirlpoolData;
}