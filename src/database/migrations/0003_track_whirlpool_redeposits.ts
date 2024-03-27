import { DataTypes } from "sequelize";
import { UmzugMigration } from "../common";


export const up: UmzugMigration = async function ({ context: queryInterface }) {
    // Start the transaction
    const transaction = await queryInterface.sequelize.transaction();

    try {
        // Add the previous price column
        await queryInterface.addColumn("Whirlpools",
            "redepositAttemptsRemaining",
            {
                type: DataTypes.INTEGER,
                defaultValue : 0,
                allowNull : false
            },
            { transaction }
        );

        // Commit it
        await transaction.commit();
    }
    catch (e) {
        // Made an error so abort
        await transaction.rollback();
        // Rethrow
        throw e;

    }
}

export const down: UmzugMigration = async function ({ context: queryInterface }) {
    // Start the transaction
    const transaction = await queryInterface.sequelize.transaction();

    try {
        // Take it away
        await queryInterface.removeColumn("Whirlpools", "redepositAttemptsRemaining", { transaction });

        await transaction.commit();
    }
    catch (e) {
        // Made an error so abort
        await transaction.rollback();
        // Rethrow
        throw e;
    }
}