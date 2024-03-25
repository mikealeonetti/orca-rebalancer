import { DataTypes, InferAttributes, InferCreationAttributes, Model } from "sequelize";
import { sequelize } from "../common";

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
