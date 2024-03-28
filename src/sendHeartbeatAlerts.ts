import { addMinutes, formatDistance } from "date-fns";
import util from 'util';
import { DBProperty, DBWhirlpool, DBWhirlpoolHistory } from "./database";
import { WhirlpoolPositionInfo } from "./getPositions";

import Debug from 'debug';
import { HEARTBEAT_FREQUENCY_MINUTES } from "./constants";
import logger from "./logger";
import { alertViaTelegram } from "./telegram";
import Decimal from "decimal.js";
import { plusOrMinusStringFromDecimal } from "./utils";
import { getTokenHoldings } from "./propertiesHelper";

const debug = Debug("rebalancer:sendHeartbeatAlerts");

const HEARTBEAT_KEY = "lastHeartbeatAlert";

export default async function (positions: WhirlpoolPositionInfo[]): Promise<void> {
    // Right NOW!
    const now = new Date();

    // Get the last heartbeat time
    const lastHeartbeat = await DBProperty.findOne({ where: { key: HEARTBEAT_KEY } });

    debug("lastHeartbeat=%s", lastHeartbeat);

    /*
    // Is it time?
    if (lastHeartbeat != null && addMinutes(new Date(lastHeartbeat.value), HEARTBEAT_FREQUENCY_MINUTES) > now) {
        debug("Not time to send another heartbeat.");
        return;
    }
    */

    // Loop each position
    for (const position of positions) {
        // Get from the db
        const [
            dbWhirlpool,
            dbWhirlpoolHistory,
            tokenAHoldings,
            tokenBHoldings
        ] = await Promise.all([
            DBWhirlpool.getByPublicKey(position.publicKey),
            DBWhirlpoolHistory.getLatestByPublicKey(position.publicKey),
            getTokenHoldings( position.tokenA ),
            getTokenHoldings( position.tokenB ),
        ]);

        if (!dbWhirlpool) {
            logger.error("Could not find position [%s] when searching for heartbeat.", position.publicKey);
            continue;
        }
        if (!dbWhirlpoolHistory) {
            logger.error("Could not find position history [%s] when searching for heartbeat.", position.publicKey);
            continue;
        }

        // Fee SOL in USDC
        const feeSolInUSDC = position.fees.tokenA.times(position.price);
        const totalFeesInUSDC = position.fees.tokenB.plus(feeSolInUSDC);
        const stakeAmountAPrice = position.amountA.times(position.price);
        const totalStakeValueUSDC = stakeAmountAPrice.plus(position.amountB);
        const lastPrice = new Decimal(dbWhirlpool.previousPrice);
        const movementPercent = position.price.minus(lastPrice).div(position.price).times(100);

        // The last collection date to calcualte from
        const calculateLastDate = dbWhirlpool.lastRewardsCollected || dbWhirlpool.createdAt || now;
        const millisSinceLastDate = now.valueOf() - calculateLastDate.valueOf();
        const hoursSinceLastDate = millisSinceLastDate / (60 * 60 * 1000);
        const percentRewards = totalFeesInUSDC.div(totalStakeValueUSDC).times(100)
        const percentPerHour = percentRewards.div(hoursSinceLastDate);
        const estPercentPerDay = percentPerHour.times(24);

        debug("calculateLastDate=%s, millisSinceLastDate=%s, hoursSinceLastDate=%s, percentPerHour=%s", calculateLastDate, millisSinceLastDate, hoursSinceLastDate, percentPerHour);

        const enteredPriceUSDC = new Decimal( dbWhirlpoolHistory.enteredPriceUSDC );
        const previousReceivedFeesTokenA = new Decimal( dbWhirlpool.previousReceivedFeesTokenA );
        const previousReceivedFeesTokenB = new Decimal( dbWhirlpool.previousReceivedFeesTokenB );
        const previousReceivedFeesTotalUSDC = new Decimal( dbWhirlpool.previousReceivedFeesTotalUSDC );
        const distanceFromEnteredPriceUSDC = totalStakeValueUSDC.minus( enteredPriceUSDC ).div( enteredPriceUSDC ).times( 100 );

        const tokenAHoldingsUSDC = tokenAHoldings.times( position.price );
        const totalTokenHoldings = tokenAHoldingsUSDC.plus( tokenBHoldings );

        // Save the last price
        await dbWhirlpool.update({ 
            previousPrice: position.price.toString(),
            previousReceivedFeesTokenA : position.fees.tokenA.toString(),
            previousReceivedFeesTokenB : position.fees.tokenB.toString(),
            previousReceivedFeesTotalUSDC : totalFeesInUSDC.toString()
        });

        let lastRebalanceString : string = "Never";
        
        if(dbWhirlpool.lastRewardsCollected)
            lastRebalanceString = `${dbWhirlpool.lastRewardsCollected.toLocaleString()} (${formatDistance( dbWhirlpool.lastRewardsCollected, now )})`

        // Prepare the text
        const text = util.format(`Position [%s]
        
Opened: %s (%s)

Price: %s (%s%%)
Low price: %s (%s%% from current)
High price: %s (%s%% from current)

Rewards total: %s USDC (%s%%, %s)
Rewards USDC: %s (%s)
Rewards SOL: %s (%s USDC, %s)
Est Per Day: %s%%

Stake total: %s USDC (%s%% from entry)
SOL amount: %s (%s USDC, %s%%)
USDC amount: %s (%s%%)

Last rebalance: %s

Profit Taken Total: %s USDC,
Profit Taken SOL: %s (%s USDC)
Profit Taken USDC: %s`,
            // Position key
            position.publicKey,
            
            // Created
            dbWhirlpool.createdAt.toLocaleString(), formatDistance(dbWhirlpool.createdAt, now),

            // Price
            position.price.toFixed(4), plusOrMinusStringFromDecimal( movementPercent, 2 ),
            position.lowerPrice.toFixed(4), position.price.minus(position.lowerPrice).div(position.price).times(100).toFixed(2),
            position.upperPrice.toFixed(4), position.upperPrice.minus(position.price).div(position.price).times(100).toFixed(2),

            // Rewards total
            totalFeesInUSDC.toFixed(2), percentRewards.toFixed(2), plusOrMinusStringFromDecimal( totalFeesInUSDC.minus( previousReceivedFeesTotalUSDC ), 2 ),
            position.fees.tokenB.toFixed(2), plusOrMinusStringFromDecimal( position.fees.tokenB.minus( previousReceivedFeesTokenB ), 2 ),
            position.fees.tokenA, feeSolInUSDC.toFixed(2), plusOrMinusStringFromDecimal( position.fees.tokenA.minus( previousReceivedFeesTokenA ) ),
            estPercentPerDay.toFixed(2),

            // Stake total
            totalStakeValueUSDC.toFixed(2), plusOrMinusStringFromDecimal( distanceFromEnteredPriceUSDC, 2 ),
            position.amountA, stakeAmountAPrice.toFixed(2), stakeAmountAPrice.div(totalStakeValueUSDC).times(100).toFixed(2),
            position.amountB.toFixed(2), position.amountB.div(totalStakeValueUSDC).times(100).toFixed(2),

            // Last rebalance
            lastRebalanceString,

            // Latest profits
            totalTokenHoldings.toFixed(2),
            tokenAHoldings, tokenAHoldingsUSDC.toFixed(2),
            tokenBHoldings.toFixed(2)
        );

        // Send a heartbeat
        await alertViaTelegram(text);
    }

    // Set the last heartbeat time
    await DBProperty.upsert({
        key: HEARTBEAT_KEY,
        value: now.toISOString()
    });
}