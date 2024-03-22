import { TokenInfo } from "@orca-so/whirlpools-sdk";
import Decimal from "decimal.js";
import { DBProperty } from "./database";

const tokenToKey = ( token : TokenInfo )=>`${token.mint.toString()}-value`;

export async function getTokenHoldings( token : TokenInfo ) : Promise<Decimal> {
    // The key
    const key = tokenToKey( token );

    // Get the previous value
    let property = await DBProperty.findOne( { where : { key } } );

    // Do we have a property already?
    if( property ) {
        // Return the value
        return new Decimal( property.value );
    }

    // Return zero
    return new Decimal( 0 );
}

export async function incrementTokenHoldings( value : Decimal, token : TokenInfo ) : Promise<void> {
    // The key
    const key = tokenToKey( token );

    // Get the previous value
    let property = await DBProperty.findOne( { where : { key } } );

    // Do we have a property already?
    if( property ) {
        // In crement
        property.value = new Decimal( property.value ).plus( value ).toString();
    }
    else {
        // Create
        property = new DBProperty( {
            key,
            value : value.toString()
        } );
    }

    // Save it
    await property.save();
}