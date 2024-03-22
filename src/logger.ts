import winston from 'winston';
import { IS_DEBUG_MODE, IS_PRODUCTION, LOG_LEVEL } from './constants';
import { format } from 'logform';
import Debug from 'debug';

import util from 'util';

const debug = Debug( "logger" );

const formatRegExp = /%[scdjifoO%]/g;

const splatSymbol = Symbol.for( "splat" );
const tagSymbol = Symbol.for( "tag" );  

/**
 * Our format function
 */
function formatFn( isFile : Boolean ) : winston.Logform.Format {
	/*
	return( format.combine(
		format.errors( { 'stack' : true } ),
		format.metadata(),
		format.splat(),
		format.printf( info=>`${new Date().toString()} ${info.level}: ${info.message}` )
	) );
	*/

	return( 
		format.printf( info=>{

		debug( "Winston extras", info );

		// Take out the ones we are going to print plain text
		const extras = info[ splatSymbol ];

		// Grab out the message
		let { message } = info;
		let tag;

		// Is the extras an actual array?
		if( extras instanceof Array && extras.length>0 ) {
			// Do we have any tags?
			for( let i=0, { length }=extras; i<length; ++i ) {
				const t = extras[ i ][ tagSymbol ];

				if( t ) {
					// Set it
					tag = t;
					// Remove it
					extras.splice( i, 1 );
					// Stop here
					break;
				}
			}

			// How many formats do we have
			const tokens = message && message.match && message.match( formatRegExp );

			// The token length
			const tokenLength = tokens&&tokens.length||0;

			debug( "We have %s tokens", tokenLength );

			// Get a count of the amount of splats
			if( tokenLength ) {
				const a = extras.splice( 0, tokenLength );

				debug( "Using tokens", a );

				message = util.format( message, ...a );
			}
		}

		//debug( "Message is", message );

		//return( util.format( "%s %s: %s %o", `${new Date().toString()} ${info.level}: ${message} ${printable.field( extras, true )}` );
		
		// Out format
		let format = "%s: <%s>"; // Date and level

		const fields = [ new Date(), info.level ];

		// Tag?
		if( tag ) {
			format+= " [%s]";
			fields.push( tag );
		}

		// Add the message
		format+= " %s";
		fields.push( message );
		
		// Add the message
		if( extras && Object.keys( extras ).length>0 ) {
			format+= " %s";
			fields.push( ...extras );
		}

		return( util.format( format, ...fields ) );

		/*
			return( util.format( "%s %s: %s %o", new Date(), info.level, message, extras ) );
		else
			return( util.format( "%s %s: %s", new Date(), info.level, message ) );
		*/
	} ) );
}



const logger = winston.createLogger( {
    level : LOG_LEVEL || "info",
    format : formatFn( true ),
    transports : [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
    ]
});

export const sqliteLogger = winston.createLogger( {
    level : LOG_LEVEL || "info",
    format : formatFn( true ),
    transports : [
        new winston.transports.File({ filename: 'sqlite.log' }),
    ]
});

if (IS_DEBUG_MODE) {
    logger.add(new winston.transports.Console({
      format: formatFn( false ),
    }));
  }

export default logger;