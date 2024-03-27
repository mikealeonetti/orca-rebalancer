import { Op } from "sequelize";
import { DBWhirlpool } from "./database";
import { WhirlpoolPositionInfo } from "./getPositions";

import Debug from 'debug';
import logger from "./logger";
import openPosition from "./openPosition";

const debug = Debug("rebalancer:checkForPositionsNeedingRerdeposits");

export default async function (positions: WhirlpoolPositionInfo[]): Promise<void> {
    // Get all positions needing redeposit
    const dbWhirlpools = await DBWhirlpool.findAll({ where: { redepositAttemptsRemaining: { [Op.gt]: 0 } } });

    debug( "Positions needing redeposit", dbWhirlpools );

    // Loop all
    for( const dbWhirlpool of dbWhirlpools ) {
        // Find in the positions
        const position = positions.find( p=>p.publicKey.toString()==dbWhirlpool.publicKey );

        if( !position ) {
            // Didn't hav eit?
            logger.warn( "Could not find position [%s] but wants to be re-deposited.", dbWhirlpool.publicKey );
        }

        // Bingo bongo
        dbWhirlpool.redepositAttemptsRemaining = dbWhirlpool.redepositAttemptsRemaining-1;

        // Save it
        await dbWhirlpool.save();

        logger.info( "Attempting to re-deposit [%s]. %d attempts left.", dbWhirlpool.publicKey, dbWhirlpool.redepositAttemptsRemaining );

        // Now attempt to re-deposit
        await openPosition( position );
    }
}