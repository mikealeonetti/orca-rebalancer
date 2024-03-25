import { sequelize } from './common';

export * from './models/DBProperty';
export * from './models/DBTelegraf';
export * from './models/DBWhirlpool';
export * from './models/DBWhirlpoolHistory';

export async function initializeDatabase() {
	// Create the DB
	await sequelize.sync();
};
