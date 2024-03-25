import { InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';
import { sqliteLogger as sequelizeLogger } from '../logger';
import { SequelizeStorage, Umzug } from 'umzug';
import path from 'path';

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