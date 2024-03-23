import 'dotenv/config';

import { first, isEmpty } from "lodash";
import { initializeDatabase } from "./database";
import getPositions from "./getPositions";
import resyncDatabasePositions from "./resyncDatabasePositions";
import openPosition from "./openPosition";


(async function () {
    // Init the database
    await initializeDatabase();

    // Get positions
    const positions = await getPositions();

    // Sync all positions
    await resyncDatabasePositions(positions);

    // Do we have any
    if (!isEmpty(positions)) {
        // Get out the first
        const firstPosition = first(positions);

        // Do it
        await openPosition(firstPosition);
    }
})();