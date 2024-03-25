import { DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { sequelize } from "../common";

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