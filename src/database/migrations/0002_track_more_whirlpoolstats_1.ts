import { DataTypes } from "sequelize";
import { UmzugMigration } from "../common";

const newFields = [
    "previousReceivedFeesTokenA",
    "previousReceivedFeesTokenB",
    "previousReceivedFeesTotalUSDC"
];

export const up: UmzugMigration = async function ({ context: queryInterface }) {
    // Start the transaction
    const transaction = await queryInterface.sequelize.transaction();

    try {
        // Loop and add
        for (const field of newFields) {
            // Add the previous price column
            await queryInterface.addColumn("Whirlpools",
                field,
                {
                    type: DataTypes.STRING,
                    defaultValue: "0",
                    allowNull: false
                },
                { transaction }
            );
        }

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
        // Loop and remove
        for (const field of newFields) {
            // Take it away
            await queryInterface.removeColumn("Whirlpools", field, { transaction });
        }

        await transaction.commit();
    }
    catch (e) {
        // Made an error so abort
        await transaction.rollback();
        // Rethrow
        throw e;
    }
}