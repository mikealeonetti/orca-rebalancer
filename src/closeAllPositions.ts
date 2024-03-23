import 'dotenv/config';

import closePosition from './closePosition';
import { DBWhirlpool, initializeDatabase } from "./database";
import getPositions from './getPositions';
import resyncDatabasePositions from "./resyncDatabasePositions";


(async function () {
    // Init the database
    await initializeDatabase();

    // Get positions
    const positions = await getPositions();

    // Sync all positions
    await resyncDatabasePositions(positions);

    // Close all positions
    for( const position of positions ) {
        // Get the position
        const dbPosition = await DBWhirlpool.findOne( { where : { publicKey : position.publicKey.toString() } } );

        if( dbPosition )
            await closePosition(position, dbPosition);
    }
})();