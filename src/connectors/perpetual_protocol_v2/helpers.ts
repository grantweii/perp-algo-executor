import { PerpV2Parameters } from '.';
import { Exchange, Market, MarketType } from '../common';

export default class PerpV2Helpers {
    static getParameters(): PerpV2Parameters {
        if (!process.env.PRIVATE_KEY) {
            throw new Error('PRIVATE_KEY must be provided in the .env');
        }
        return {
            privateKey: process.env.PRIVATE_KEY,
            httpRpcUrl: process.env.HTTP_RPC_URL,
            wsRpcUrl: process.env.WS_RPC_URL,
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
