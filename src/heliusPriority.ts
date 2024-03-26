import { ComputeBudgetProgram, TransactionInstruction } from "@solana/web3.js";
import memoize from 'memoizee';
import fetch from 'node-fetch';
import { ctx } from "./solana";

import { ORCA_WHIRLPOOL_PROGRAM_ID } from "@orca-so/whirlpools-sdk";
import Debug from 'debug';
import { TransactionBuilder } from "@orca-so/common-sdk";
import { round } from "lodash";
import { IS_PRODUCTION } from "./constants";

const debug = Debug("rebalancer:heliusPriority");

export enum PriorityLevel {
    NONE, // 0th percentile
    LOW, // 25th percentile
    MEDIUM, // 50th percentile
    HIGH, // 75th percentile
    VERY_HIGH, // 95th percentile
    // labelled unsafe to prevent people using and draining their funds by accident
    UNSAFE_MAX, // 100th percentile 
    DEFAULT, // 50th percentile
}

export async function getPriorityFeeEstimate(): Promise<number> {
    const payloadToSend = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "getPriorityFeeEstimate",
        "params": [{
            "accountKeys": [ORCA_WHIRLPOOL_PROGRAM_ID],
            "options": {
                "includeAllPriorityFeeLevels": true
            }
        }]
    };

    const body = JSON.stringify(payloadToSend);

    debug("bodyB=", body);

    const response = await fetch(ctx.connection.rpcEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });
    const data = await response.json();

    debug("data=", data);

    const priotiyFeeNumber = Number( data.result.priorityFeeLevels.high ) * 1.3;

    return round( priotiyFeeNumber );
}

const memoizedGetPriorityFeeEstimate = memoize(getPriorityFeeEstimate, { maxAge: 5 * 60 * 100 });

export async function heliusCreateDynamicPriorityFeeInstruction(): Promise<TransactionInstruction> {
    const priorityFee = await getPriorityFeeEstimate();

    debug("result=", priorityFee);

    //const priorityFee = result.per_compute_unit.medium; // 👈 Insert business logic to calculate fees depending on your transaction requirements (e.g., low, medium, high, or specific percentile)
    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee });

    return priorityFeeInstruction;
}

export async function heliusAddPriorityFeeToTxBuilder( txBuilder : TransactionBuilder ) : Promise<void> {
    // Does not apply in production
    if( !IS_PRODUCTION )
        return;

    const ix = await heliusCreateDynamicPriorityFeeInstruction();

    txBuilder.prependInstruction({
        instructions : [ ix ],
        cleanupInstructions : [],
        signers : []
    })
}