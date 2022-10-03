import { PerpV2Parameters } from '.';
import { Market, MarketType } from '../common';
import { Exchange } from '../interface';

export default class PerpV2Helpers {
    static getParameters(): PerpV2Parameters {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY must be provided in the .env');
        }
        return {
            privateKey: process.env.PRIVATE_KEY,
            rpcUrl: process.env.RPC_URL,
        };
    }

    static getMarket(baseToken: string): Market {
        return {
            baseToken,
            quoteToken: 'USD',
            type: MarketType.Future,
            internalName: `${baseToken}USD`,
            exchange: Exchange.PerpetualProtocolV2,
        };
    }
}
