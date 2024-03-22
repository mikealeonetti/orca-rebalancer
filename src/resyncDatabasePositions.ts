import { findIndex } from "lodash";
import { DBWhirlpool, DBWhirlpoolHistory } from "./database";
import { WhirlpoolPositionInfo } from "./getPositions";
import logger from "./logger";


export default async function (positions: WhirlpoolPositionInfo[]): Promise<void> {
    // Get all positions from our database
    const dbWhirlpools = await DBWhirlpool.findAll();

    // Find all positions not in our database
    const notInDatabase = positions.filter( position=>findIndex( dbWhirlpools, { publicKey : position.publicKey.toString() } )==-1 );

    // Find all database stuff not in positions
    const notInPositions = dbWhirlpools.filter( wp=>positions.findIndex( p=>p.publicKey.toString()==wp.publicKey )==-1 );

    // Add all new positions
    for( const position of notInDatabase ) {
        // Shorthand
        const publicKey = position.publicKey.toString();

        // Report
        logger.info( "Not tracking position [%s]. Adding to the database to track.", publicKey );

        // Add a new entry
        await DBWhirlpool.create( {
            publicKey,
            feeUSD : "0" // We failed to track this
        } );

        // Add to the history
        await DBWhirlpoolHistory.create( {
            publicKey,
            feeUSD : "0" // I'm sorry
        });
    }

    // Close all previous positions
    for( const dbPosition of notInPositions ) {
        // Report
        logger.info( "Position was closed [%s].", dbPosition.publicKey );

        // Upsert the history
        const history = await DBWhirlpoolHistory.findOne( {
            where : { publicKey : dbPosition.publicKey },
            order : [[ "createdAt", "DESC" ]]
        });

        // Set the closed date
        if( history ) {
            history.closed = new Date(); // Now
            await history.save();
        }

        // Remove from DB
        await dbPosition.destroy();
    }
}