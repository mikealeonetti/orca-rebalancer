import { addMinutes } from "date-fns";
import { DBProperty, DBWhirlpool } from "./database";
import { WhirlpoolPositionInfo } from "./getPositions";
import util from 'util';

import Debug from 'debug';
import { HEARTBEAT_FREQUENCY_MINUTES } from "./constants";
import { find } from "lodash";
import logger from "./logger";
import { alertViaTelegram } from "./telegram";

const debug = Debug("sendHeartbeatAlerts");

const HEARTBEAT_KEY = "lastHeartbeatAlert";

export default async function (positions: WhirlpoolPositionInfo[]): Promise<void> {
    // Right NOW!
    const now = new Date();

    // Get the last heartbeat time
    const lastHeartbeat = await DBProperty.findOne({ where: { key: HEARTBEAT_KEY } });

    debug("lastHeartbeat=%s", lastHeartbeat);

    // Is it time?
    if ( lastHeartbeat!=null && addMinutes(new Date(lastHeartbeat.value), HEARTBEAT_FREQUENCY_MINUTES) > now) {
        debug("Not time to send another heartbeat.");
        return;
    }

    // Loop each position
    for (const position of positions) {
        // Get from the db
        const dbWhirlpool = await DBWhirlpool.findOne( { where : { publicKey : position.publicKey.toString() } } );

        if (!dbWhirlpool) {
            logger.error("Could not find position [%s] when searching for heartbeat.", position.publicKey);
            continue;
        }

        // Fee SOL in USDC
        const feeSolInUSDC = position.fees.tokenA.times(position.price);

        // Prepare the text
        const text = util.format(`Position [%s]
        
Opened: %s

Price: %s
Low price: %s (%s%% from current)
High price: %s (%s%% from current)

Fee total: %s USDC
Fee USDC: %s
Fee SOL: %s (%s USDC)

Last rebalance: %s`,
            position.publicKey, new Date().toLocaleString(), // Created at???

            position.price.toFixed(4),
            position.lowerPrice.toFixed(4), position.price.minus(position.lowerPrice).div(position.price).times(100).toFixed(2),
            position.upperPrice.toFixed(4), position.upperPrice.minus(position.price).div(position.price).times(100).toFixed(2),

            position.fees.tokenB.plus(feeSolInUSDC).toFixed(2),
            position.fees.tokenB.toFixed(2),
            position.fees.tokenA, feeSolInUSDC.toFixed(2),

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