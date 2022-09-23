import { FtxParameters } from '.';
import { Market, MarketType } from '../common';
import { Exchange } from '../interface';

export default class FtxHelpers {
    static getParameters(): FtxParameters {
        if (!process.env.FTX_API_KEY) {
            throw new Error('FTX_API_KEY must be provided');
        }
        if (!process.env.FTX_API_SECRET) {
            throw new Error('FTX_API_SECRET must be provided');
        }
        return {
            apiKey: process.env.FTX_API_KEY,
            apiSecret: process.env.FTX_API_SECRET,
            subaccount: process.env.FTX_SUBACCOUNT,
        };
    }

    static getMarket(marketType: MarketType, token: string): Market {
        switch (marketType) {
            case MarketType.Future: {
                return {
                    baseToken: token,
                    quoteToken: 'USD',
                    type: marketType,
                    internalName: `${token}-PERP`,
                    exchange: Exchange.Ftx,
                };
            }
            case MarketType.Spot: {
                return {
                    baseToken: token,
                    quoteToken: 'USD',
                    type: marketType,
                    internalName: `${token}/USD`,
                    exchange: Exchange.Ftx,
                };
            }
        }
    }
}
