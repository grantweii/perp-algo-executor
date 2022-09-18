import { MarketResponse, Order, PlaceOrder, Position } from './common';
import { Method } from 'axios';

export enum Exchange {
    Ftx,
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
    getPosition(marketName: string): Promise<Position | null>;
    /**
     * Closes entire position with a market order.
     * @param marketName
     */
    closePosition(marketName: string): Promise<Order | null>;
    cancelAllOrders(marketName?: string): Promise<string>;
    getOpenOrders(marketName?: string): Promise<Order[]>;
}
