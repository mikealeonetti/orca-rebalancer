import { ctx } from "./solana";


export default function() : Promise<number> {
    return ctx.connection.getBalance(ctx.wallet.publicKey);
}