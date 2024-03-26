import Decimal from "decimal.js";
import { ctx } from "./solana";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { DecimalUtil, TokenUtil } from "@orca-so/common-sdk";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

import Debug from 'debug';

const debug = Debug("rebalancer:getTokenBalance");

export default async function( wantedMint : PublicKey ) : Promise<Decimal> {

    // Get the accounts
    const accounts = await ctx.connection.getParsedTokenAccountsByOwner(ctx.wallet.publicKey,
        {
            programId : TOKEN_PROGRAM_ID
        });

    debug( "accounts=", accounts );


    // Loop each
    for( const account of accounts.value ) {
        const parsedToken = account.account.data.parsed;

        debug( "parsedToken=", parsedToken );

        // Shorthand the info
        const { info } = parsedToken;

        // Shorthand the mint
        const { mint, tokenAmount } = info as { mint : string, tokenAmount : any };

        // Is this the token we want?
        if( wantedMint.toString()==mint ) {
            // Shorthand the token data
            const { amount, decimals } = tokenAmount as { amount : string, decimals : number };

            debug( "amount=", amount, "decimal=", decimals);

            // Got the token
            return DecimalUtil.fromBN(new BN(amount), decimals);
        }
    }

    // Fallback
    return( new Decimal( 0 ) );
}