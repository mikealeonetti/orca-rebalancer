import { ORCA_WHIRLPOOL_PROGRAM_ID, PDAUtil, PriceMath } from "@orca-so/whirlpools-sdk";
import { PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";
import { USDC, WHIRLPOOLS_CONFIG } from "./constants";
import { client } from "./solana";

export default async function( mintFrom : PublicKey, decimalsFrom : number ) : Promise<Decimal> {
  // WhirlpoolsConfig account
  // devToken ecosystem / Orca Whirlpools
  const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");

  // Get devSAMO/devUSDC whirlpool
  const tick_spacing = 64;
  const whirlpool_pubkey = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      WHIRLPOOLS_CONFIG,
      mintFrom, USDC.mint, tick_spacing).publicKey;
  console.log("whirlpool_key:", whirlpool_pubkey.toBase58());
  const whirlpool = await client.getPool(whirlpool_pubkey);

  // Get the current price of the pool
  const sqrt_price_x64 = whirlpool.getData().sqrtPrice;
  const price = PriceMath.sqrtPriceX64ToPrice(sqrt_price_x64, decimalsFrom, USDC.decimals);

  return( price );
}