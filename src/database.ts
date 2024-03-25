import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Sequelize } from 'sequelize';
import { sqliteLogger as sequelizeLogger } from './logger';

export const sequelize = new Sequelize({
	dialect: 'sqlite',
	storage: "database.sqlite3",
	logging: (...opts) => sequelizeLogger.info(...opts)
});


// order of InferAttributes & InferCreationAttributes is important.
export class DBProperty extends Model<InferAttributes<DBProperty>, InferCreationAttributes<DBProperty>> {
	declare key: string;
	declare value: string;
}

DBProperty.init({
	key: {
		type: DataTypes.STRING,
		allowNull: false,
		unique: true
	},
	value: {
		type: DataTypes.STRING,
		allowNull: false
	}
},
	{
		sequelize,
		tableName: "Properties"
	});

export class DBWhirlpool extends Model<InferAttributes<DBWhirlpool>, InferCreationAttributes<DBWhirlpool>> {
	declare publicKey: string;
	declare outOfRangeSince: Date | null;
	declare feeUSD: string;
	declare lastRewardsCollected: Date | null;
	// createdAt can be undefined during creation
	declare createdAt: CreationOptional<Date>;
	// updatedAt can be undefined during creation
	declare updatedAt: CreationOptional<Date>;
}

DBWhirlpool.init({
	publicKey: {
		type: DataTypes.STRING,
		allowNull: false,
		unique: true
	},
	outOfRangeSince: {
		type: DataTypes.DATE,
		allowNull: true
	},
	feeUSD: {
		type: DataTypes.STRING,
		allowNull: false
	},
	lastRewardsCollected: {
		type: DataTypes.DATE
	},
	createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
},
	{
		sequelize,
		tableName: "Whirlpools"
	});

export class DBWhirlpoolHistory extends Model<InferAttributes<DBWhirlpoolHistory>, InferCreationAttributes<DBWhirlpoolHistory>> {
	declare publicKey: string;
	declare closed: Date | null;
	declare feeUSD: string;
	declare receivedFeesTokenA: string | null;
	declare receivedFeesTokenB: string | null;
}

DBWhirlpoolHistory.init({
	publicKey: {
		type: DataTypes.STRING,
		allowNull: false
	},
	closed: {
		type: DataTypes.DATE
	},
	feeUSD: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	receivedFeesTokenA: {
		type: DataTypes.STRING,
	},
	receivedFeesTokenB: {
		type: DataTypes.STRING,
	},
},
	{
		sequelize,
		tableName: "WhirlpoolHistories",
		indexes: [{
			unique: false,
			fields: ["publicKey"]
		},
		{
			unique: false,
			fields: ["closed"]
		},
		{
			unique: false,
			fields: ["createdAt"]
		}
		]
	});

export class DBTelegraf extends Model<InferAttributes<DBTelegraf>, InferCreationAttributes<DBTelegraf>> {
	declare chatID: number;
}

DBTelegraf.init({
	chatID: {
		type: DataTypes.INTEGER,
		allowNull: false,
		unique: true
	}
},
	{
		sequelize,
		tableName: "Telegrafs"
	});

export async function initializeDatabase() {
	// Create the DB
	await sequelize.sync();
};
