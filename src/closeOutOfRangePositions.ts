import { addMinutes } from "date-fns";
import { TOLERANCE_IN_MINUTES } from "./constants";
import { DBWhirlpool } from "./database";
import { WhirlpoolPositionInfo } from "./getPositions";
import logger from "./logger";
import closePosition from "./closePosition";
import Bluebird from "bluebird";

import Debug from 'debug';

const debug = Debug( "closeOutOfRangePositions" );

async function handlePosition(position: WhirlpoolPositionInfo): Promise<boolean> {
    // Shorthand the mint
    const positionPublicKey = position.publicKey.toString();

    // Get in the database
    const dbWhirlpool = await DBWhirlpool.findOne({ where: { publicKey: positionPublicKey } });

    // Do we not have?
    if (!dbWhirlpool) {
        logger.error("Position [%s] not found to handle.", positionPublicKey);
        return( false );
    }

    const { tickCurrentIndex } = position.whirlpoolData;
    const { tickLowerIndex, tickUpperIndex } = position.position;

    // Check if the price is out of range
    const isOutOfRange = tickCurrentIndex < tickLowerIndex || tickCurrentIndex >= tickUpperIndex;
    //const isOutOfRange = true;

    debug( "pool [%s] price=%s, tickCurrentIndex=%s, tickLowerIndex=%s, tickUpperIndex=%s, isOutOfRange=%s",
     positionPublicKey, position.price, tickCurrentIndex, tickLowerIndex, tickUpperIndex, isOutOfRange );

    // Are we keeping the position
    let keepPosition = true;

    // Are we out of range?
    if( isOutOfRange ) {
        // Have we been out of range?
        if( dbWhirlpool.outOfRangeSince!=null ) {
            // Is it time?
            const toleranceExpires = addMinutes( dbWhirlpool.outOfRangeSince, TOLERANCE_IN_MINUTES );

            // Did we pass the expiration?
            if( new Date()>=toleranceExpires ) {
                logger.info( "[%s] went out of range for at least %d minutes. Will close to rebalance.", positionPublicKey, TOLERANCE_IN_MINUTES);

                // Close position
                const positionRemoved = await closePosition(position, dbWhirlpool);

                // Do not keep the position
                keepPosition = !positionRemoved;
            }
        }
        else {
            logger.info( "[%s] went out of range. Going to rebalance in %d minutes if it doesn't come back in range.", positionPublicKey, TOLERANCE_IN_MINUTES);

            // Set the out of range since now
            dbWhirlpool.outOfRangeSince = new Date();
            // Save
            await dbWhirlpool.save();
        }
    }
    // Do we have to clear the outOfRangeSince
    else if( dbWhirlpool.outOfRangeSince!=null ) {
        logger.info( "[%s] came back in range. Going to wait to close it.", positionPublicKey);
        // Clear it because we in range
        dbWhirlpool.outOfRangeSince = null;
        await dbWhirlpool.save();
    }

    return keepPosition;
}

export default async function (positions: WhirlpoolPositionInfo[]): Promise<WhirlpoolPositionInfo[]> {
    return Bluebird.filter( positions, handlePosition, { concurrency : 1 } );
}