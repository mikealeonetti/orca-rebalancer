import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { sequelize } from "../common";

export class DBTelegraf extends Model<InferAttributes<DBTelegraf>, InferCreationAttributes<DBTelegraf>> {
	declare chatID: number;
		// createdAt can be undefined during creation
		declare createdAt: CreationOptional<Date>;
		// updatedAt can be undefined during creation
		declare updatedAt: CreationOptional<Date>;
}

DBTelegraf.init({
	chatID: {
		type: DataTypes.INTEGER,
		allowNull: false,
		unique: true
	},
	createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
},
	{
		sequelize,
		tableName: "Telegrafs"
	});
