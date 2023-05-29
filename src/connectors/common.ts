import { Dayjs } from 'dayjs';

export const DEFAULT_OPTIMISM_HTTP_RPC_URL = "https://mainnet.optimism.io";
export const DEFAULT_OPTIMISM_WS_RPC_URL = "wss://ws-mainnet.optimism.io";

export enum Exchange {
    Ftx = 'ftx',
    PerpetualProtocolV2 = 'perpetual_protocol_v2',
    Binance = 'binance',
}

export enum MarketType {
    Future = 'future',
    Spot = 'spot',
}

export enum Side {
    Buy = 'buy',
    Sell = 'sell',
}

export namespace Side {
    export function opposite(side: Side): Side {
        return side === Side.Buy ? Side.Sell : Side.Buy;
    }

    export function fromSignedAmount(amount: number): Side {
        return amount > 0 ? Side.Buy : Side.Sell;
    }

    export function fromDirection(direction: Direction): Side {
        return direction === Direction.Long ? Side.Buy : Side.Sell;
    }

    export function fromOppositeDirection(direction: Direction): Side {
        return direction === Direction.Long ? Side.Sell : Side.Buy;
    }
}

export enum Direction {
    Long = 'long',
    Short = 'short',
}

export namespace Direction {
    export function opposite(direction: Direction): Direction {
        return direction === Direction.Long ? Direction.Short : Direction.Long;
    }

    export function fromSignedAmount(amount: number): Direction {
        return amount > 0 ? Direction.Long : Direction.Short;
    }

    export function fromSide(side: Side): Direction {
        return side === Side.Buy ? Direction.Long : Direction.Short;
    }

    export function fromOppositeSide(side: Side): Direction {
        return side === Side.Buy ? Direction.Short : Direction.Long;
    }
}

export enum OrderType {
    Market = 'market',
    Limit = 'limit',
}

export enum TimeInForce {
    GTC = 'gtc',
    IOC = 'ioc',
    FOK = 'fok',
}

export enum OrderStatus {
    New = 'new',
    Open = 'open',
    Closed = 'closed',
}

export type Order = {
    updateTime: Dayjs;
    filledSize: number;
    id: number;
    market: string;
    price: number | null;
    remainingSize: number;
    side: Side;
    size: number;
    status: OrderStatus;
    type: OrderType;
    reduceOnly: boolean;
    timeInForce: TimeInForce;
    postOnly: boolean;
    clientOrderId: string;
};

export type PlaceOrder = {
    market: string;
    side: Side;
    price?: number | null;
    type: OrderType;
    size: number;
    reduceOnly: boolean;
    timeInForce?: TimeInForce;
    postOnly: boolean;
    clientOrderId?: string;
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
    lastBid: number; // last queried top bid price
    lastAsk: number; // last queried top ask price
};

// Internal market type
export type Market = {
    baseToken: string;
    quoteToken: string; // can be changed for our system's purposes so may not be market's actual quote token
    type: MarketType;
    externalName: string; // exchange's actual market identifier
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
