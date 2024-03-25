import { InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';
import { sqliteLogger as sequelizeLogger } from '../logger';

export const sequelize = new Sequelize({
	dialect: 'sqlite',
	storage: "database.sqlite3",
	logging: (...opts) => sequelizeLogger.info(...opts)
});