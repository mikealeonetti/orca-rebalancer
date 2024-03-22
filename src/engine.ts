import Bluebird from "bluebird";
import { isEmpty } from "lodash";
import closeOutOfRangePositions from "./closeOutOfRangePositions";
import getPositions from "./getPositions";
import logger from "./logger";
import openPosition from "./openPosition";
import resyncDatabasePositions from "./resyncDatabasePositions";

import Debug from 'debug';

const debug = Debug( "engine" );

export default async function (): Promise<void> {
    // The main async event loop
    while (true) {
        try {
            debug( "minute executed" );
            // Get all open positions
            let openPositions = await getPositions();

            // Cross check the database
            await resyncDatabasePositions(openPositions);

            // Close any positions out of range
            openPositions = await closeOutOfRangePositions( openPositions );

            //debug( "New open positions=", openPositions );

            // Do we have no more positions open?
            if( isEmpty(openPositions) ) {
                logger.info( "No positions open. Attempting to open another one." );

                await openPosition();
            }
       }
       catch( e ) {
        logger.error( "Error running minute." , e);
       }

        // 1 minute
        await Bluebird.delay(60*1000);
    }
}