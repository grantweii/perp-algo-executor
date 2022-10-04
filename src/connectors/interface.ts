import { Market, MarketResponse, Order, PlaceOrder, Position, Quote, QuoteParams } from './common';
import { Method } from 'axios';

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
    /**
     * Calculates the expected average price given order notional.
     * @param params 
     */
    quote(params: QuoteParams): Promise<Quote>;
}
