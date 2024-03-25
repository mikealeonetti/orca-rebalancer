import { DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { sequelize } from "../common";

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
