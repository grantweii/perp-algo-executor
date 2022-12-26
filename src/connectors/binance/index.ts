import axios, {
    AxiosError,
    AxiosInstance,
    AxiosRequestConfig,
    AxiosRequestHeaders,
    AxiosResponse,
} from 'axios';
import { createHmac } from 'crypto';
import {
    PlaceOrder as GenericPlaceOrder,
    Order,
    MarketResponse,
    Market,
    Position,
    OrderType,
    Side,
    Orderbook,
    Exchange,
    TimeInForce,
} from '../common';
import { HttpClient, Request } from '../interface';
import { BinanceMarketsResponse, GetMarkets } from './model/market';
import {
    BinanceOrder,
    CancelAllOrders,
    CancelAllOrdersResponse,
    GetOpenOrders,
    PlaceOrder,
} from './model/order';
import { GetOrderbook } from './model/orderbook';
import { BinancePosition, GetPosition } from './model/position';

export type BinanceParameters = {
    apiKey: string;
    apiSecret: string;
};

type ApiError = {
    code: number,
    msg: string,
}

export class BinanceFuturesClient extends HttpClient {
    private static readonly BASE_URL = 'https://fapi.binance.com';
    private client: AxiosInstance;
    private apiSecret: string;

    constructor(params: BinanceParameters) {
        super(Exchange.Binance);
        const headers: AxiosRequestHeaders = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-MBX-APIKEY': params.apiKey,
        };
        const client = axios.create({
            baseURL: BinanceFuturesClient.BASE_URL,
            headers,
        });

        this.client = client;
        this.apiSecret = params.apiSecret;
        this.marketInfo = {};
    }

    private requestConfig<R extends Request>(request: R) {
        let body: string | null = null;

        // generate query params
        const searchParams = new URLSearchParams();
        const paramsEntries = Object.entries(request.getParams() || {});
        for (const [key, value] of paramsEntries) {
            if (value != null) searchParams.set(key, String(value));
        }

        if (request.AUTH) {
            const signed_payload = createHmac('sha256', this.apiSecret)
                .update(searchParams.toString())
                .digest('hex');
            searchParams.set('signature', signed_payload);
        }
        let url = request.PATH;
        if (request.METHOD === 'GET') {
            url += `?${searchParams.toString()}`;
        } else {
            body = searchParams.toString();
        }
        const config: AxiosRequestConfig = {
            method: request.METHOD,
            url,
            data: body,
        };
        return config;
    }

    async placeOrder(params: GenericPlaceOrder): Promise<Order> {
        if (params.type === OrderType.Limit && !params.price) {
            throw new Error('Price is required for limit order');
        }
        const minSize = this.marketInfo[params.market].minSize;
        if (params.size < minSize)
            throw new Error(
                `Failed to send binance order. Order min size for ${params.market} is ${minSize}`
            );
        try {
            const response: AxiosResponse<BinanceOrder> = await this.client(
                this.requestConfig(new PlaceOrder(params))
            );
            return PlaceOrder.deserialize(response.data);
        } catch (err: unknown) {
            throw new Error((err as AxiosError<ApiError>).response?.data?.msg);
        }
    }

    async getMarkets(): Promise<MarketResponse[]> {
        const response: AxiosResponse<BinanceMarketsResponse> = await this.client(
            this.requestConfig(new GetMarkets())
        );
        return GetMarkets.deserialize(response.data.symbols);
    }

    async getPosition(market: Market): Promise<Position | null> {
        const response: AxiosResponse<BinancePosition[]> = await this.client(
            this.requestConfig(new GetPosition(market))
        );
        return GetPosition.deserialize(response.data);
    }

    async closePosition(market: Market): Promise<Order | null> {
        const position = await this.getPosition(market);
        if (!position) return null;
        const order = await this.placeOrder({
            market: market.externalName,
            side: position.side === Side.Buy ? Side.Sell : Side.Buy,
            type: OrderType.Market,
            size: Math.abs(position.size),
            reduceOnly: true,
            postOnly: false,
            timeInForce: TimeInForce.IOC
        });
        return order;
    }

    async cancelAllOrders(market?: Market | undefined): Promise<void> {
        const response: AxiosResponse<CancelAllOrdersResponse> = await this.client(
            this.requestConfig(new CancelAllOrders(market))
        );
        if (Number(response.data.code) !== 200) {
            throw new Error(`Failed to cancel all binance orders. Err: ${response.data.msg}`);
        }
    }

    async getOpenOrders(market?: Market | undefined): Promise<Order[]> {
        const response: AxiosResponse<BinanceOrder[]> = await this.client(
            this.requestConfig(new GetOpenOrders(market))
        );
        return GetOpenOrders.deserialize(response.data);
    }

    async getOrderbook(externalName: string, depth?: number) {
        const response: AxiosResponse<Orderbook> = await this.client(
            this.requestConfig(new GetOrderbook({ symbol: externalName, limit: depth }))
        );
        return response.data;
    }
}
