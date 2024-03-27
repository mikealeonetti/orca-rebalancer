import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { sequelize } from "../common";
import { PublicKey } from "@solana/web3.js";

export class DBWhirlpool extends Model<InferAttributes<DBWhirlpool>, InferCreationAttributes<DBWhirlpool>> {
	declare publicKey: string;
	declare outOfRangeSince: Date | null;
	declare remainingSpentTokenA : string;
	declare remainingSpentTokenB : string;
	declare lastRewardsCollected: Date | null;
	// createdAt can be undefined during creation
	declare createdAt: CreationOptional<Date>;
	// updatedAt can be undefined during creation
	declare updatedAt: CreationOptional<Date>;
	declare previousPrice : CreationOptional<string>;
	declare previousReceivedFeesTokenA : CreationOptional<string>;
	declare previousReceivedFeesTokenB : CreationOptional<string>;
	declare previousReceivedFeesTotalUSDC : CreationOptional<string>;

	declare static getByPublicKeyString : ( publicKey : string )=>Promise<DBWhirlpool|null>;
	declare static getByPublicKey : ( publicKey : PublicKey )=>Promise<DBWhirlpool|null>;
}

DBWhirlpool.getByPublicKeyString = function( publicKey : string ) : Promise<DBWhirlpool|null> {
	return this.findOne({
		where: { publicKey }
	});
};

DBWhirlpool.getByPublicKey = function( publicKey : PublicKey ) : Promise<DBWhirlpool|null> {
	return this.getByPublicKeyString( publicKey.toString() );
};

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
	remainingSpentTokenA: {
		type: DataTypes.STRING,
		allowNull: false
	},
	remainingSpentTokenB: {
		type: DataTypes.STRING,
		allowNull: false
	},
	lastRewardsCollected: {
		type: DataTypes.DATE
	},
	previousPrice : {
		type: DataTypes.STRING,
		defaultValue : "0",
		allowNull : false
	},
	// New
	previousReceivedFeesTokenA : {
		type: DataTypes.STRING,
		defaultValue : "0",
		allowNull : false
	},
	previousReceivedFeesTokenB : {
		type: DataTypes.STRING,
		defaultValue : "0",
		allowNull : false
	},
	previousReceivedFeesTotalUSDC : {
		type: DataTypes.STRING,
		defaultValue : "0",
		allowNull : false
	},
	// New
	createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
},
	{
		sequelize,
		tableName: "Whirlpools"
	});