import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { sequelize } from "../common";
import { PublicKey } from "@solana/web3.js";

export class DBWhirlpoolHistory extends Model<InferAttributes<DBWhirlpoolHistory>, InferCreationAttributes<DBWhirlpoolHistory>> {
	declare publicKey: string;
	declare closed: Date | null;
	declare totalSpentUSDC: string;
	declare totalSpentTokenA: string;
	declare totalSpentTokenB: string;
	declare enteredPriceUSDC: string;
	declare closedPriceUSDC: string | null;
	declare receivedFeesTokenA: CreationOptional<string>;
	declare receivedFeesTokenB: CreationOptional<string>;
	// createdAt can be undefined during creation
	declare createdAt: CreationOptional<Date>;
	// updatedAt can be undefined during creation
	declare updatedAt: CreationOptional<Date>;

	declare static getLatestByPublicKeyString : ( publicKey : string )=>Promise<DBWhirlpoolHistory|null>;
	declare static getLatestByPublicKey : ( publicKey : PublicKey )=>Promise<DBWhirlpoolHistory|null>;
}

DBWhirlpoolHistory.getLatestByPublicKeyString = function( publicKey : string ) : Promise<DBWhirlpoolHistory|null> {
	return this.findOne({
		where: { publicKey },
		order: [["createdAt", "DESC"]]
	});
};

DBWhirlpoolHistory.getLatestByPublicKey = function( publicKey : PublicKey ) : Promise<DBWhirlpoolHistory|null> {
	return this.getLatestByPublicKeyString( publicKey.toString() );
};

DBWhirlpoolHistory.init({
	publicKey: {
		type: DataTypes.STRING,
		allowNull: false
	},
	closed: {
		type: DataTypes.DATE
	},
	totalSpentUSDC: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	totalSpentTokenA: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	totalSpentTokenB: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	receivedFeesTokenA: {
		type: DataTypes.STRING,
		defaultValue: "0"
	},
	receivedFeesTokenB: {
		type: DataTypes.STRING,
		defaultValue: "0"
	},
	enteredPriceUSDC: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	closedPriceUSDC: {
		type: DataTypes.STRING,
	},
	createdAt: DataTypes.DATE,
	updatedAt: DataTypes.DATE,
},
	{
		sequelize,
		tableName: "WhirlpoolHistories",
	});