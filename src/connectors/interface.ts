import {
    Direction,
    Exchange,
    Market,
    MarketInfo,
    MarketResponse,
    Order,
    Orderbook,
    PlaceOrder,
    Position,
    Quote,
    QuoteParams,
} from './common';
import { Method } from 'axios';

export interface Request {
    METHOD: Method; // Upper case only! eg. GET, POST
    PATH: string;
    AUTH: boolean;

    getParams(): Record<string, string | number | boolean | null | undefined> | null;
}

export abstract class HttpClient {
    public marketInfo: Record<string, MarketInfo> = {};
    private readonly exchange: Exchange;

    constructor(exchange: Exchange) {
        this.exchange = exchange;
    }

    abstract placeOrder(params: PlaceOrder): Promise<Order>;
    abstract getMarkets(): Promise<MarketResponse[]>;
    abstract getPosition(market: Market): Promise<Position | null>;
    /**
     * Closes entire position with a market order.
     * @param market
     */
    abstract closePosition(market: Market): Promise<Order | null>;
    abstract cancelAllOrders(market?: Market): Promise<void>;
    abstract getOpenOrders(market?: Market): Promise<Order[]>;
    /**
     * Calculates the expected average price given order notional.
     * @param params
     */
    abstract getOrderbook(externalName: string, depth?: number): Promise<Orderbook>;

    /**
     * Validates and instantiates requested markets. Fails if there is an invalid market.
     * @param requestedMarkets
     */
    async init(requestedMarkets: Market[]) {
        const marketsResponse = await this.getMarkets();
        const invalidMarkets: Market[] = [];
        const validMarkets: MarketResponse[] = [];
        for (const requestedMarket of requestedMarkets) {
            const validMarket = marketsResponse.find(
                (validMarket) => validMarket.name === requestedMarket.externalName
            );
            if (!validMarket) {
                invalidMarkets.push(requestedMarket);
            } else {
                validMarkets.push(validMarket);
            }
        }
        if (invalidMarkets.length)
            throw new Error(
                `Not all requested ${this.exchange} markets were valid. Invalid: ${invalidMarkets
                    .map((m) => m.externalName)
                    .join(', ')}`
            );
        for (const market of validMarkets) {
            const orderbook = await this.getOrderbook(market.name);
            this.marketInfo[market.name] = {
                tickSize: market.priceIncrement,
                minSize: market.minSize,
                sizeIncrement: market.sizeIncrement,
                lastBid: Number(orderbook.bids[0][0]),
                lastAsk: Number(orderbook.asks[0][0]),
            };
        }
    }

    /**
     * Calculates the expected average price given order notional.
     * @param params
     */
    async quote(params: QuoteParams): Promise<Quote> {
        const orderbook = await this.getOrderbook(params.market.externalName, 100);
        // update prices
        this.marketInfo[params.market.externalName].lastBid = Number(orderbook.bids[0][0]);
        this.marketInfo[params.market.externalName].lastAsk = Number(orderbook.asks[0][0]);

        let runningNotional = 0;
        let runningSize = 0;
        let i = 0;
        let price;
        let volume;
        const ladder = params.direction === Direction.Long ? orderbook.asks : orderbook.bids;
        while (runningNotional < params.orderNotional) {
            price = Number(ladder[i][0]);
            volume = Number(ladder[i][1]);
            const notional = price * volume;
            const remainingNotional = params.orderNotional - runningNotional;
            if (remainingNotional < notional) {
                const remainingSize = remainingNotional / price;
                runningSize += remainingSize;
                runningNotional += remainingNotional;
            } else {
                runningSize += volume;
                runningNotional += notional;
            }
            i++;
        }
        return {
            averagePrice: runningNotional / runningSize,
            orderSize: runningSize,
        };
    }
}
