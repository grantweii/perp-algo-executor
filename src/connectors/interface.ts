import { Market, MarketResponse, Order, PlaceOrder, Position } from './common';
import { Method } from 'axios';

export enum Exchange {
    Ftx,
    PerpetualProtocolV2
}

export interface Request {
    METHOD: Method; // Upper case only! eg. GET, POST
    PATH: string;
    AUTH: boolean;

    getParams(): Record<string, string | number | boolean | null | undefined> | null;
}

export interface HttpClient {
    placeOrder(params: PlaceOrder): Promise<Order>;
    getMarkets(): Promise<MarketResponse[]>;
    getPosition(market: Market): Promise<Position | null>;
    /**
     * Closes entire position with a market order.
     * @param market
     */
    closePosition(market: Market): Promise<Order | null>;
    cancelAllOrders(market?: Market): Promise<string>;
    getOpenOrders(market?: Market): Promise<Order[]>;
}
