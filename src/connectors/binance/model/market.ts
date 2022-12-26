import { Method } from 'axios';
import { Request } from '../../interface';
import { MarketResponse, MarketType } from '../../common';

type BinanceMarket = {
    symbol: string;
    status: string;
    baseAsset: string;
    quoteAsset: string;
    filters: Filter[];
};

type Filter = {
    filterType: string;
    tickSize?: string;
    stepSize?: string;
    minQty?: string;
};

export type BinanceMarketsResponse = {
    symbols: BinanceMarket[];
};

export class GetMarkets implements Request {
    METHOD: Method = 'GET';
    PATH: string = '/fapi/v1/exchangeInfo';
    AUTH: boolean = false;

    getParams = () => null;

    static deserialize(response: BinanceMarket[]): MarketResponse[] {
        return response.map((market) => {
            const priceFilter = market.filters.find((f) => f.filterType == 'PRICE_FILTER');
            const sizeFilter = market.filters.find((f) => f.filterType == 'LOT_SIZE');
            if (!priceFilter || !priceFilter.tickSize) throw new Error(`Failed to find price filter for ${market.symbol}`);
            if (!sizeFilter || !sizeFilter.stepSize || !sizeFilter.minQty) throw new Error(`Failed to find size filter for ${market.symbol}`);
            return {
                name: market.symbol,
                type: MarketType.Future,
                baseToken: market.baseAsset,
                quoteToken: market.quoteAsset,
                priceIncrement: Number(priceFilter.tickSize),
                sizeIncrement: Number(sizeFilter.stepSize),
                minSize: Number(sizeFilter.minQty),
            }
        })
    }
}
