import { DBWhirlpool, DBWhirlpoolHistory } from "./database";
import { WhirlpoolPositionInfo } from "./getPositions";

import Debug from 'debug';
import logger from "./logger";
import Decimal from "decimal.js";
import collectFees from "./collectFees";
import openPosition from "./openPosition";
import { attemptBeforeFail } from "./utils";

const debug = Debug("rebalancer:shouldTriggerRedeposit");

export default async function (positions: WhirlpoolPositionInfo[]) {
    // Loop each whirlperl
    for (const position of positions) {

        const publicKeyString = position.publicKey.toString();

        debug( "Checking %s to see if we need to re-deposit.", publicKeyString);

        // Can we get the history?
        const [
            dbWhirlpoolHistory,
            dbWhirlpool
        ] = await Promise.all([
            DBWhirlpoolHistory.getLatestByPublicKeyString(publicKeyString),
            DBWhirlpool.getByPublicKeyString(publicKeyString)
        ]);

        // Do we have?
        if (!dbWhirlpoolHistory) {
            logger.warn("Cannot find whirlpool history [%s] to check for re-deposit.", publicKeyString);
            continue;
        }
        if (!dbWhirlpool) {
            logger.warn("Cannot find whirlpool [%s] to check for re-deposit.", publicKeyString);
            continue;
        }

        debug("position.fees.tokenA=%s, position.fees.tokenB=%s", position.fees.tokenA, position.fees.tokenB);

        // See if we have at least 1% in gains
        const totalFeesInUSDC = position.fees.tokenA.times(position.price).plus(position.fees.tokenB);
        const enteredPriceUSDC = new Decimal(dbWhirlpoolHistory.enteredPriceUSDC);

        debug("totalFeesInUSDC=%s, enteredPriceUSDC=%s", totalFeesInUSDC, enteredPriceUSDC);

        // Get what percent of the opening price we have in feez now
        const percentOfOpeningPrice = totalFeesInUSDC.div(enteredPriceUSDC).times(100);

        debug("percentOfOpeningPrice=%s", percentOfOpeningPrice);

        // Is it greater than 1%?
        if( percentOfOpeningPrice.gte(1) ) {
            logger.info( "Percent of opening price is greater than 1%. Trigger re-deposit." );
    

            // First trigger collection
            logger.debug( "Collecting rewards." );

            await collectFees( position );

            // Now redeposit
            logger.debug( "Re-depositing." );

            await attemptBeforeFail( ()=>openPosition( position ), 5, 100 );
        }
        else {
            debug( "Not enough to want to re-deposit." );
        }
    }
}