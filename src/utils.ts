import Bluebird from "bluebird";

import Debug from 'debug';

const debug = Debug("rebalancer:utils");

export async function attemptBeforeFail<T>(
    fn: () => T,
    attemptTimes: number,
    millisDelay: number
): Promise<T> {
    let lastE: unknown;

    for (let i = 0; i < attemptTimes; ++i) {
        debug("attemptBeforeFail attempt %d", i);

        // Delay it?
        if (i > 0)
            await Bluebird.delay(millisDelay);

        try {
            // Try it
            const response = await fn();

            // Return it
            return response;
        }
        catch (e) {
            lastE = e;
        }
    }

    debug( "attemptBeforeFail failing." );

    // Uh ohs
    throw lastE;
}