import { FtxParameters } from '.';
import { Exchange, Market, MarketType } from '../common';

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

    static getMarket(token: string, marketType: MarketType): Market {
        switch (marketType) {
            case MarketType.Future: {
                return {
                    baseToken: token,
                    quoteToken: 'USD',
                    type: marketType,
                    externalName: `${token}-PERP`,
                    exchange: Exchange.Ftx,
                };
            }
            case MarketType.Spot: {
                return {
                    baseToken: token,
                    quoteToken: 'USD',
                    type: marketType,
                    externalName: `${token}/USD`,
                    exchange: Exchange.Ftx,
                };
            }
        }
    }
}
