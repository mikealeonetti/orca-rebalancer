import 'dotenv/config';

import { NATIVE_MINT } from "@solana/spl-token";
import { USDC } from "./constants";
import getSolBalance from "./getSolBalance";
import getTokenBalance from "./getTokenBalance";
import { ctx } from "./solana";

import Debug from 'debug';
import engine from './engine';
import logger from './logger';
import { DBWhirlpool, initializeDatabase } from './database';
import getPositions from './getPositions';
import closePosition from './closePosition';

const debug = Debug( "index" );

// Environment variables must be defined before script execution
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
// ANCHOR_WALLET=wallet.json

debug("NATIVE_MINT=", NATIVE_MINT);

async function main() {
    // Create WhirlpoolClient
    //console.log ( "Ad=", await ctx.connection.requestAirdrop(ctx.wallet.publicKey, 1));

    logger.info("endpoint: %s", ctx.connection.rpcEndpoint);
    logger.info("wallet pubkey: %s", ctx.wallet.publicKey);
    logger.info("getBalance SOL=%s", await getSolBalance());
    logger.info("getBalance USDC=%s", await getTokenBalance(USDC.mint));

    /*


    const positions = await getPositions();

    const dd = await DBWhirlpool.findOne();

    await closePosition(positions[0], dd!);

    return;
    */

    // Init the DB
    await initializeDatabase();

    // Run the engine
    await engine();
}

main();