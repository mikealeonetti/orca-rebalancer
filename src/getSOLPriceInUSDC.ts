import { NATIVE_MINT } from "@solana/spl-token";
import getPriceInUSDC from "./getPriceInUSDC";
import Decimal from "decimal.js";


export default function() : Promise<Decimal> {
    return getPriceInUSDC(NATIVE_MINT, 9);
}