import { PublicKey } from "@solana/web3.js";

export interface MintAndDecimals {
    mint : PublicKey;
    decimals : number;
    name : string;
}

export type ComputeBudgetOption = {
    type: "none";
} | {
    type: "fixed";
    priorityFeeLamports: number;
    computeBudgetLimit?: number;
} | {
    type: "auto";
    maxPriorityFeeLamports?: number;
    computeBudgetLimit?: number;
    percentile?: number;
};