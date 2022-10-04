import { Direction } from '../strategies/interface';

export enum Exchange {
    Ftx = 'ftx',
    PerpetualProtocolV2 = 'perpetual_protocol_v2'
}

export enum MarketType {
    Future = 'future',
    Spot = 'spot',
}

export enum Side {
    Buy = 'buy',
    Sell = 'sell',
}

export enum OrderType {
    Market = 'market',
    Limit = 'limit',
}

export type Order = {
    createdAt: string;
    filledSize: number;
    future: string;
    id: number;
    market: string;
    price: number;
    remainingSize: number;
    side: string;
    size: number;
    status: string;
    type: string;
    reduceOnly: boolean;
    ioc: boolean;
    postOnly: boolean;
    clientId: string;
};

export type PlaceOrder = {
    market: string;
    side: Side;
    price: number | null;
    type: OrderType;
    size: number;
    reduceOnly: boolean;
    ioc: boolean;
    postOnly: boolean;
    clientId?: string;
};

// Mapped return response to GetMarkets
export type MarketResponse = {
    name: string;
    type: MarketType;
    baseToken: string;
    quoteToken: string;
    priceIncrement: number;
    sizeIncrement: number;
    minSize: number;
};

export type MarketInfo = {
    tickSize: number;
    minSize: number;
    sizeIncrement: number;
};

// Internal market type
export type Market = {
    baseToken: string;
    quoteToken: string; // can be changed for our system's purposes so may not be market's actual quote token
    type: MarketType;
    internalName: string; // exchange's actual market identifier
    exchange: Exchange;
};

export type Orderbook = {
    bids: [number, number][];
    asks: [number, number][];
};

export type Position = {
    market: string;
    size: number;
    side: Side;
    entryPrice: number;
    unrealizedPnl: number;
    liquidationPrice: number;
};

export type QuoteParams = {
    market: Market;
    orderNotional: number;
    direction: Direction;
};

export type Quote = {
    averagePrice: number;
    orderSize: number;
};
