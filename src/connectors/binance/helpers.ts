import { BinanceParameters } from '.';
import { Exchange, Market, MarketType } from '../common';

export default class BinanceHelpers {
    static getParameters(): BinanceParameters {
        if (!process.env.BINANCE_API_KEY) {
            throw new Error('BINANCE_API_KEY must be provided');
        }
        if (!process.env.BINANCE_API_SECRET) {
            throw new Error('BINANCE_API_SECRET must be provided');
        }
        return {
            apiKey: process.env.BINANCE_API_KEY,
            apiSecret: process.env.BINANCE_API_SECRET,
        };
    }

    static getMarket(baseToken: string, quoteToken: string, marketType: MarketType): Market {
        return {
            baseToken,
            quoteToken,
            type: marketType,
            externalName: `${baseToken}${quoteToken}`,
            exchange: Exchange.Binance,
        };
    }
}
