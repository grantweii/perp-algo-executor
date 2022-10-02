import { Method } from 'axios';
import { MarketResponse, MarketType } from '../../common';
import { Request } from '../../interface';

export type FtxMarket = {
    name: string;
    baseCurrency: string;
    quoteCurrency: string;
    quoteVolume24h: number;
    change1h: number;
    change24h: number;
    changeBod: number;
    highLeverageFeeExempt: boolean;
    minProvideSize: number;
    type: string;
    underlying: string;
    enabled: boolean;
    ask: number;
    bid: number;
    last: number;
    postOnly: boolean;
    price: number;
    priceIncrement: number;
    sizeIncrement: number;
    restricted: boolean;
    volumeUsd24h: number;
    largeOrderThreshold: number;
    isEtfMarket: boolean;
};

export class GetMarkets implements Request {
    METHOD: Method = 'GET';
    PATH: string = '/markets';
    AUTH: boolean = false;

    getParams = () => null;

    static deserialize(response: FtxMarket[]): MarketResponse[] {
        return response.map((market) => {
            return {
                name: market.name,
                type: market.type as MarketType,
                baseToken: market.baseCurrency,
                quoteToken: market.quoteCurrency,
                priceIncrement: market.priceIncrement,
                sizeIncrement: market.sizeIncrement,
                minSize: market.minProvideSize,
            };
        });
    }
}

type GetOrderbookRequest = {
    marketName: string,
    depth?: number,
}

export class GetOrderbook implements Request {
    METHOD: Method = 'GET';
    // PATH: string = '/markets/{}/orderbook';
    AUTH: boolean = false;
    private request: GetOrderbookRequest;

    constructor(request: GetOrderbookRequest) {
        this.request = request;
    }

    get PATH() {
        return `/markets/${this.request.marketName}/orderbook`
    }

    getParams = () => this.request;
}