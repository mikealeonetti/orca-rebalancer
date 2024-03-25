import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { sequelize } from "../common";

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