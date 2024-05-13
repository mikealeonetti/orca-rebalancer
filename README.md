# Orca Rebalancer bot
This bot is a "dumb" bot for providing liqudiity to Orca.so (https://v1.orca.so/liquidity/browse).

I call it "dumb" because it just simply rebalances based on a percentage up and down versus the current price.

I also decomissioned it because there is a *huge* bug currently in Orca that improperly reports the earned fees when the price goes out of range. That was seriously tripping up my math. I was really trying to aim tracking PnL.

## How it works
As stated above, the bot works by:

1. Checking if a position is open.
    1. If not open a new position.
2. If open then get the positions stats.
    1. If within a certain threshold for fees earned (for example 24 hours elapsed or 1% earned).
    2. Recompound back in keeping correct balance.
3. If position is out of range.
    1. Close position and re-balance taking rewards.
4. Track all PnL using sqlite3.

This only operates using the SOL/USDC pair.

## The RPC I used & gas estimations
This operates using the Helius (https://www.helius.dev/) RPC. It also uses Helius to estimate the gas necessary to complete the transactions. Keep that in mind if you're using this.

I had a lot of trouble with transactions executing so the gas estimations slowly hike up every time there is a failure before it tries again.

## Things to note
* The code is quick and dirty and not properly commented (and I'm sorry).
* Solana is not my favorite chain. I just wanted to tell you that.
* I am not recommending to use this bot to make money. This is for educational purposes only. NFA. DYOR.
* If you find that I accidentally put my private key in the code somewhere, please don't steal my Solana.
* As mentioned in the outset, there is a bug calcuating the fees earned when the price is out of range. That will throw off your whole accounting.
  * And I have abandoned this project because of it.

## .env config
You will need to use a .env config with your settings. You can tweak some stuff with it. Here is the one I used.
```
# Your provider URLs from helius
ANCHOR_PROVIDER_URL_DEVNET=https://devnet.helius-rpc.com/?api-key=...
ANCHOR_PROVIDER_URL_MAINNET=https://mainnet.helius-rpc.com/?api-key=...

# Your private key values in an array
ANCHOR_WALLET=/home/mike/dev/node/orca-rebalancer/wallet.json

# For the winston logger
LOG_LEVEL=debug

# Whether or not to use the MAINNET RPC
IS_PRODUCTION=false

# How many minutes until you want to re-balance when the price is out of range.
# If you don't like this you'll have to modify the code
TOLERANCE_IN_MINUTES=5

# Slippage in percents out of 100
SWAP_SLIPPAGE=3
DEPOSIT_SLIPPAGE=0.1
WITHDRAW_SLIPPAGE=3

# Ignored aggressively when IS_PRODUCTION is false
# To select the Orca pool
WANTED_TICK_SPACING=4

# The range your entire position is.
# For example, a RNAGE_PERCENT of 7 will
# put you at a price in the middle with the lower
# price being 3.5% down and upper price being 3.5%
# up.
RANGE_PERCENT=7

# How much of the profit will go in your wallet and not touched.
# The rest is compounded back in.
TAKE_PROFIT_PERCENT=50

# How much gas to hold back for txns.
GAS_TO_SAVE=0.05

# Do not re-compound or open a position
# when the total amount to deposit is less than this.
MINIMUM_AMOUNT_TO_DEPOSIT_DOLLARS=5

# Opening a position is actually somewhat more expensive
# than gas because of account fees. This is just an estimate.
# Really, you should be getting this from the transaction.
# But, again, quick and dirty code so...
OPEN_POSITION_FEE=0.01561672

# Enabling this gives more logging info.
IS_DEBUG_MODE=true

# If you want to receive alerts on Telegram enter your Telegram bot ID and subscribe.
TELEGRAM_BOT_TOKEN=...
```