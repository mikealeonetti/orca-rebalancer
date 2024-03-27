import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
import { NATIVE_MINT } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { toLower } from "lodash";
import { MintAndDecimals } from "./Types";

const DEVNET_WHIRLPOOLS_CONFIG = new PublicKey("FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR");
const DEVNET_USDC: MintAndDecimals = { mint: new PublicKey("BRjpCHtyQLNCo8gqRUr8jtdAj5AjPYQaoqbvcZiHok1k"), decimals: 6, name : "devUSDC" };

const PRODUCTION_WHIRLPOOLS_CONFIG = new PublicKey("2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ");
const PRODUCTION_USDC: MintAndDecimals = { mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), decimals: 6, name : "USDC" };

export const IS_PRODUCTION: Boolean = process.env.IS_PRODUCTION != null && toLower(process.env.IS_PRODUCTION) == "true" || false;

export const WHIRLPOOLS_CONFIG = IS_PRODUCTION ? PRODUCTION_WHIRLPOOLS_CONFIG : DEVNET_WHIRLPOOLS_CONFIG;
export const USDC = IS_PRODUCTION ? PRODUCTION_USDC : DEVNET_USDC;
export const SOLANA: MintAndDecimals = { mint: NATIVE_MINT, decimals: 9, name : "SOL" };

export const LOG_LEVEL: string = process.env.LOG_LEVEL || "info";

export const TOLERANCE_IN_MINUTES: number = Number(process.env.TOLERANCE_IN_MINUTES) || 5;

export const DEPOSIT_SLIPPAGE = Percentage.fromDecimal(DecimalUtil.fromNumber(  Number(process.env.DEPOSIT_SLIPPAGE) || 1 ));
export const SWAP_SLIPPAGE = Percentage.fromDecimal(DecimalUtil.fromNumber(  Number(process.env.SWAP_SLIPPAGE) || 1 ));
export const WITHDRAW_SLIPPAGE = Percentage.fromDecimal(DecimalUtil.fromNumber(  Number(process.env.WITHDRAW_SLIPPAGE) || 1 ));

export const WANTED_TICK_SPACING = IS_PRODUCTION ? ( Number( process.env.WANTED_TICK_SPACING ) || 4 ) : 64;

export const RANGE_PERCENT = Number( process.env.RANGE_PERCENT ) || 10;

export const TAKE_PROFIT_PERCENT = Percentage.fromDecimal(DecimalUtil.fromNumber(  Number(process.env.TAKE_PROFIT_PERCENT) || 50 ));

export const GAS_TO_SAVE = Number( process.env.GAS_TO_SAVE ) || 0.01;

export const MINIMUM_AMOUNT_TO_DEPOSIT_DOLLARS = Number( process.env.MINIMUM_AMOUNT_TO_DEPOSIT_DOLLARS ) || 5;

export const IS_DEBUG_MODE: Boolean = process.env.IS_DEBUG_MODE != null && toLower(process.env.IS_DEBUG_MODE) == "true" || false;

export const OPEN_POSITION_FEE = Number( process.env.OPEN_POSITION_FEE ) || 0.015;

export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export const HEARTBEAT_FREQUENCY_MINUTES = Number( process.env.HEARTBEAT_FREQUENCY_MINUTES ) || 60;

export const MAX_RETRIES_SETTING = 5;