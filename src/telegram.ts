import { Context, Telegraf } from "telegraf";

import Debug from 'debug';
import { TELEGRAM_BOT_TOKEN } from "./constants";
import { Update } from "telegraf/typings/core/types/typegram";
import { DBTelegraf } from "./database";
import logger from "./logger";

const debug = Debug( "telegram" );

// Our bot
let bot : Telegraf<Context<Update>>;

// Do we have a bot token?
if( TELEGRAM_BOT_TOKEN ) {
	debug( "Creting bot" );
	// Create the bot
	bot = new Telegraf( TELEGRAM_BOT_TOKEN );

	debug( "New bot", bot );

	// Command to enable the alerts
	bot.command( "enable_alerts_rebalancer", async ctx=>{
		try {
			debug( "Subscription", ctx );

			const exists = await DBTelegraf.findOne( { 'where' : { chatID: ctx.chat.id } } );

			// Already?
			if( exists ) {
				// Send a message back
				bot.telegram.sendMessage( ctx.chat.id, "You are already enabled for alerts." );
			}
			else {
				// Add it
				await DBTelegraf.create( { chatID : ctx.chat.id } );

				// Let's do 
				bot.telegram.sendMessage( ctx.chat.id, "Enabled you for alerts." );
			}
		}
		catch( e ) {
			logger.warn( "Error saving chat ID for Telegram", e, ctx );
		}
	} );

	debug( "Launching bot" );

	// Lunch the bot.
	// Lunch. Yum.
	bot.launch()
	.then( ()=>logger.info( "Telegram bot launch successful") )
	.catch( e=>logger.error( "Telegram bot launch failure.", e ) );
}
else
	logger.warn( "No Telegram bot token specified. Going without one." );

/**
 * Send a message
 */
export async function alertViaTelegram( message : string ) : Promise<void> {
	debug( "Looking to send message", message );

	// We don't have a bot, don't send a message
	if( !bot )
		return( debug( "No bot. Ending." ) );
	
	debug( "Attempting to send message", message );

	// Get all chats to message
	const chats = await DBTelegraf.findAll();

	// Send to each
	for( const chat of chats ) {
		try {
			// Send it
			bot.telegram.sendMessage( chat.chatID, message );
		}
		catch( e ) {
			logger.warn( "Could not send message to chat %d on Telegram. Deleting.", chat.chatID, e );

			// Kill it
			await chat.destroy().catch( e=>logger.warn( "Error destroying chat Telegram chat %d.", chat.chatID ) );
		}
	}
}