import { sequelize, umzug } from './common';

import { sqliteLogger as sequelizeLogger } from '../logger';

export * from './models/DBProperty';
export * from './models/DBTelegraf';
export * from './models/DBWhirlpool';
export * from './models/DBWhirlpoolHistory';


export async function initializeDatabase() {
    try {
        // Do it now
        await sequelize.authenticate();

        // Now syncd
        await umzug.up();
    }
    catch (e) {
        // Do it
        sequelizeLogger.error("Sequelize connexion error.", e);

        // Rethrow
        throw e;
    }

};

