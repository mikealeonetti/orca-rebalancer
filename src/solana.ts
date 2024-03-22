import { AnchorProvider } from "@coral-xyz/anchor";
import {
    ORCA_WHIRLPOOL_PROGRAM_ID,
    WhirlpoolContext, buildWhirlpoolClient
} from "@orca-so/whirlpools-sdk";
  
  // Create WhirlpoolClient
  export const provider = AnchorProvider.env();
  export const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
  export const client = buildWhirlpoolClient(ctx);