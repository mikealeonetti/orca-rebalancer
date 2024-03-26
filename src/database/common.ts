import path from 'path';
import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { sqliteLogger as sequelizeLogger } from '../logger';

export const sequelize = new Sequelize({
	dialect: 'sqlite',
	storage: "database.sqlite3",
	logging: (...opts) => sequelizeLogger.info(...opts)
});

export const umzug = new Umzug({
    migrations: { glob: path.join(__dirname, 'migrations/*.js') },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: sequelizeLogger
});

export type UmzugMigration = typeof umzug._types.migration;