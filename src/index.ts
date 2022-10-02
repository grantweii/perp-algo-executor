import { getHttpClient, getPerpV2Client } from './connectors';
import { Market, MarketType, OrderType, Side } from './connectors/common';
import FtxHelpers from './connectors/ftx/helpers';
import { Exchange } from './connectors/interface';
import { PerpV2Client } from './connectors/perpetual_protocol_v2';
import PerpV2Helpers from './connectors/perpetual_protocol_v2/helpers';
import { Direction } from './strategies/interface';
import { BigNumber } from 'ethers';
import Big from 'big.js';

export * from './connectors';
require('dotenv').config();

async function main() {
    
}

main()
    .then()
    .catch((err) => {
        console.log(`Failed to run funding arb. Error: ${err.message}`);
    });
