import { addMinutes } from "date-fns";
import util from 'util';
import { DBProperty, DBWhirlpool, DBWhirlpoolHistory } from "./database";
import { WhirlpoolPositionInfo } from "./getPositions";

import Debug from 'debug';
import { HEARTBEAT_FREQUENCY_MINUTES } from "./constants";
import logger from "./logger";
import { alertViaTelegram } from "./telegram";
import Decimal from "decimal.js";

const debug = Debug("rebalancer:sendHeartbeatAlerts");

const HEARTBEAT_KEY = "lastHeartbeatAlert";

export default async function (positions: WhirlpoolPositionInfo[]): Promise<void> {
    // Right NOW!
    const now = new Date();

    // Get the last heartbeat time
    const lastHeartbeat = await DBProperty.findOne({ where: { key: HEARTBEAT_KEY } });

    debug("lastHeartbeat=%s", lastHeartbeat);

    // Is it time?
    /*
    if ( lastHeartbeat!=null && addMinutes(new Date(lastHeartbeat.value), HEARTBEAT_FREQUENCY_MINUTES) > now) {
        debug("Not time to send another heartbeat.");
        return;
    }
    */

    // Loop each position
    for (const position of positions) {
        // Get from the db
        const [
                dbWhirlpool,
                dbWhirlpoolHistory
         ] = await Promise.all( [
                DBWhirlpool.getByPublicKey( position.publicKey ),
                DBWhirlpoolHistory.getLatestByPublicKey( position.publicKey )
         ] );

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
        const stakeAmountAPrice = position.amountA.times( position.price );
        const totalStakeValueUSDC = stakeAmountAPrice.plus( position.amountB );
        const lastPrice = new Decimal( dbWhirlpool.previousPrice );
        const movementPercent = position.price.minus( lastPrice ).div(position.price).times(100);

        // Save the last price
        await dbWhirlpool.update( { previousPrice : position.price.toString() } );

        // The last collection date to calcualte from
        const calculateLastDate = dbWhirlpool.lastRewardsCollected || dbWhirlpool.createdAt || now;
        const millisSinceLastDate = now.valueOf() - calculateLastDate.valueOf();
        const hoursSinceLastDate = millisSinceLastDate/(60*60*1000);
        const percentRewards = totalFeesInUSDC.div( totalStakeValueUSDC ).times(100)
        const percentPerHour = percentRewards.div(hoursSinceLastDate);
        const estPercentPerDay = percentPerHour.times(24);

        debug( "calculateLastDate=%s, millisSinceLastDate=%s, hoursSinceLastDate=%s, percentPerHour=%s", calculateLastDate, millisSinceLastDate, hoursSinceLastDate, percentPerHour  )


        // Prepare the text
        const text = util.format(`Position [%s]
        
Opened: %s

Price: %s (%s%%)
Low price: %s (%s%% from current)
High price: %s (%s%% from current)

Rewards total: %s USDC (%s%%)
Rewards USDC: %s
Rewards SOL: %s (%s USDC)
Est Per Day: %s%%

Stake total: %s USDC
SOL amount: %s (%s USDC, %s%%)
USDC amount: %s (%s%%)

Last rebalance: %s`,
            position.publicKey, dbWhirlpool.createdAt.toLocaleString(), // Created at???

            position.price.toFixed(4), movementPercent.gt(0) ? `+${movementPercent.toFixed(2)}` : movementPercent.toFixed(2),
            position.lowerPrice.toFixed(4), position.price.minus(position.lowerPrice).div(position.price).times(100).toFixed(2),
            position.upperPrice.toFixed(4), position.upperPrice.minus(position.price).div(position.price).times(100).toFixed(2),

            totalFeesInUSDC.toFixed(2), percentRewards.toFixed(2),
            position.fees.tokenB.toFixed(2),
            position.fees.tokenA, feeSolInUSDC.toFixed(2),
            estPercentPerDay.toFixed(2),

            totalStakeValueUSDC.toFixed(2),
            position.amountA, stakeAmountAPrice.toFixed(2), stakeAmountAPrice.div( totalStakeValueUSDC ).times(100).toFixed(2),
            position.amountB.toFixed(2), position.amountB.div( totalStakeValueUSDC ).times(100).toFixed(2),

            dbWhirlpool.lastRewardsCollected ? dbWhirlpool.lastRewardsCollected.toLocaleString() : "Never"
        );

        // Send a heartbeat
        await alertViaTelegram(text);
    }

    // Set the last heartbeat time
    await DBProperty.upsert({
        key : HEARTBEAT_KEY,
        value: now.toISOString()
    });
}