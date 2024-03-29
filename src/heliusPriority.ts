import { ComputeBudgetProgram, TransactionInstruction } from "@solana/web3.js";
import memoize from 'memoizee';
import fetch from 'node-fetch';
import { ctx } from "./solana";

import { TransactionBuilder } from "@orca-so/common-sdk";
import { ORCA_WHIRLPOOL_PROGRAM_ID } from "@orca-so/whirlpools-sdk";
import { addMinutes } from "date-fns";
import Debug from 'debug';
import { IS_PRODUCTION } from "./constants";

const debug = Debug("rebalancer:heliusPriority");

interface LastGasAndExpiry {
    expiry: Date | null;
    lastGas: number | null;
}

const lastGasAndExpiry: LastGasAndExpiry = {
    lastGas: null,
    expiry: null
};

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

interface PriorityFeeLevels {
    min: number;
    low: number;
    medium: number;
    high: number;
    veryHigh: number;
    unsafeMax: number;
}

export async function getPriorityFeeEstimate(): Promise<PriorityFeeLevels> {
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

    return data.result.priorityFeeLevels as PriorityFeeLevels;
}

const memoizedGetPriorityFeeEstimate = memoize(getPriorityFeeEstimate, { maxAge: 5 * 60 * 1000 });

export async function heliusCreateDynamicPriorityFeeInstruction(): Promise<TransactionInstruction> {
    const priorityFee = await getLastGas();

    debug("result=", priorityFee);

    //const priorityFee = result.per_compute_unit.medium; // 👈 Insert business logic to calculate fees depending on your transaction requirements (e.g., low, medium, high, or specific percentile)
    const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee });

    return priorityFeeInstruction;
}

async function getLastGas(): Promise<number> {
    const now = new Date();

    // Do we have a last gas?
    const expired = lastGasAndExpiry.expiry == null || now >= lastGasAndExpiry.expiry;

    // Get from the helius
    if (expired || lastGasAndExpiry.lastGas == null) {
        const priorityFees = await memoizedGetPriorityFeeEstimate();

        debug("We have expired. Setting last gas back");

        // Set to medium
        lastGasAndExpiry.lastGas = priorityFees.medium;
    }

    // Set the last expired
    lastGasAndExpiry.expiry = addMinutes(now, 5);

    // Return it
    return (lastGasAndExpiry.lastGas);
}

export async function heliusIncreaseLastGas(): Promise<void> {
    // Does not apply in production
    if (!IS_PRODUCTION)
        return;

    // Get the last gas
    const lastGas = await getLastGas();

    // Get the maximum
    const maximum = await memoizedGetPriorityFeeEstimate();

    debug("Last gas maximum=", maximum);

    // Increase by 1.2
    lastGasAndExpiry.lastGas = Math.min(lastGas * 1.3, maximum.veryHigh);

    debug("New last gas=", lastGasAndExpiry);
}

export async function heliusAddPriorityFeeToTxBuilder(txBuilder: TransactionBuilder): Promise<void> {
    // Does not apply in production
    if (!IS_PRODUCTION)
        return;

    const ix = await heliusCreateDynamicPriorityFeeInstruction();

    txBuilder.prependInstruction({
        instructions: [ix],
        cleanupInstructions: [],
        signers: []
    })
}