import { DataTypes } from "sequelize";
import { UmzugMigration } from "../common";


export const up: UmzugMigration = async function ({ context: queryInterface }) {
    // Start the transaction
    const transaction = await queryInterface.sequelize.transaction();

    try {
        // Create the properties
        await queryInterface.createTable("Properties", {
            id: {
				type: DataTypes.INTEGER,
				primaryKey: true,
				autoIncrement: true
			},
            key: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true
            },
            value: {
                type: DataTypes.STRING,
                allowNull: false
            },
            createdAt: DataTypes.DATE,
            updatedAt: DataTypes.DATE,
        },
            {
                transaction
            });

        // Create the telgrafs
        await queryInterface.createTable("Telegrafs", {
            id: {
				type: DataTypes.INTEGER,
				primaryKey: true,
				autoIncrement: true
			},
            chatID: {
                type: DataTypes.INTEGER,
                allowNull: false,
                unique: true
            },
            createdAt: DataTypes.DATE,
            updatedAt: DataTypes.DATE,
        },
            {
                transaction
            });

        // Whirlpools
        await queryInterface.createTable("Whirlpools", {
            id: {
				type: DataTypes.INTEGER,
				primaryKey: true,
				autoIncrement: true
			},
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
            createdAt: DataTypes.DATE,
            updatedAt: DataTypes.DATE,
        },
            {
                transaction
            });

        // WhirlpoolHistories
        await queryInterface.createTable("WhirlpoolHistories", {
            id: {
				type: DataTypes.INTEGER,
				primaryKey: true,
				autoIncrement: true
			},
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
                defaultValue : "0",
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
                transaction
            });

        // Add the indexes
        await queryInterface.addIndex("WhirlpoolHistories", {
            unique: false,
            fields: ["publicKey"],
            transaction
        });
        await queryInterface.addIndex("WhirlpoolHistories", {
            unique: false,
            fields: ["closed"],
            transaction
        });
        await queryInterface.addIndex("WhirlpoolHistories", {
            unique: false,
            fields: ["createdAt"],
            transaction
        });

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
        await queryInterface.dropTable("Properties");
        await queryInterface.dropTable("Telegrafs");
        await queryInterface.dropTable("Whirlpools");
        await queryInterface.dropTable("WhirlpoolHistories");

        await transaction.commit();
    }
    catch (e) {
        // Made an error so abort
        await transaction.rollback();
        // Rethrow
        throw e;
    }
}