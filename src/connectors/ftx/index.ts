import {
    PlaceOrder as GenericPlaceOrder,
    Order,
    MarketResponse,
    Market,
    Position,
    Side,
    OrderType,
    Orderbook,
    TimeInForce,
    Exchange,
} from '../common';
import { HttpClient, Request } from '../interface';
import axios, {
    AxiosInstance,
    AxiosRequestConfig,
    AxiosRequestHeaders,
    AxiosResponse,
} from 'axios';
import { CancelAllOrders, FtxOrder, GetOpenOrders, PlaceOrder } from './model/order';
import { createHmac } from 'crypto';
import { FtxMarket, GetMarkets } from './model/market';
import { FtxPosition, GetPosition } from './model/position';
import { GetOrderbook } from './model/orderbook';

export type FtxParameters = {
    apiKey: string;
    apiSecret: string;
    subaccount?: string;
};

type Response<T> = {
    success: boolean;
    result?: T;
    error?: string;
};

export class FtxClient extends HttpClient {
    private static readonly BASE_URL = 'https://ftx.com/api';
    private client: AxiosInstance;
    private apiSecret: string;

    constructor(params: FtxParameters) {
        super(Exchange.Ftx);
        const headers: AxiosRequestHeaders = {
            'Content-Type': 'application/json',
            'FTX-KEY': params.apiKey,
        };
        if (params.subaccount) {
            headers['FTX-SUBACCOUNT'] = params.subaccount;
        }
        const client = axios.create({
            baseURL: FtxClient.BASE_URL,
            headers,
        });

        this.client = client;
        this.apiSecret = params.apiSecret;
        this.marketInfo = {};
    }

    private requestConfig<R extends Request>(request: R) {
        let params: Record<string, string | number | boolean | null | undefined> | null = null;
        let body: Record<string, string | number | boolean | null | undefined> | null = null;
        let url = request.PATH;
        if (request.METHOD === 'GET') {
            params = request.getParams();

            // generate query string
            const searchParams = new URLSearchParams();
            const paramsEntries = Object.entries(params || {});
            for (const [key, value] of paramsEntries) {
                if (value != null) searchParams.set(key, String(value));
            }
            if (paramsEntries.length) url += `?${searchParams.toString()}`;
        } else {
            body = request.getParams();
        }
        const config: AxiosRequestConfig = {
            method: request.METHOD,
            url: request.PATH,
            params,
            data: body,
        };
        if (request.AUTH) {
            const timestamp = Date.now();
            const payload = `${timestamp}${request.METHOD}/api${url}${JSON.stringify(body) ?? ''}`;
            const signed_payload = createHmac('sha256', this.apiSecret)
                .update(payload)
                .digest('hex');
            config.headers = {
                'FTX-TS': timestamp,
                'FTX-SIGN': signed_payload,
            };
        }
        return config;
    }

    async placeOrder(params: GenericPlaceOrder): Promise<Order> {
        if (params.type === OrderType.Limit && !params.price) {
            throw new Error('Price is required for limit order');
        }
        const minSize = this.marketInfo[params.market].minSize;
        if (params.size < minSize) throw new Error(`Failed to send order. Order min size for ${params.market} is ${minSize}`);
        const response: AxiosResponse<Response<FtxOrder>> = await this.client(
            this.requestConfig(new PlaceOrder(params))
        );
        if (!response.data.success || !response.data.result || response.data.error) {
            throw new Error(response.data.error);
        }
        return PlaceOrder.deserialize(response.data.result);
    }

    async getMarkets(): Promise<MarketResponse[]> {
        const response: AxiosResponse<Response<FtxMarket[]>> = await this.client(
            this.requestConfig(new GetMarkets())
        );
        if (!response.data.success || !response.data.result || response.data.error) {
            throw new Error(response.data.error);
        }
        return GetMarkets.deserialize(response.data.result);
    }

    async getPosition(market: Market): Promise<Position | null> {
        const response: AxiosResponse<Response<FtxPosition[]>> = await this.client(
            this.requestConfig(new GetPosition())
        );
        if (!response.data.success || !response.data.result || response.data.error) {
            throw new Error(response.data.error);
        }
        const position = response.data.result.find((p) => p.future == market.externalName);
        if (!position || position.size === 0) return null;
        return GetPosition.deserialize(position);
    }

    async closePosition(market: Market): Promise<Order | null> {
        const position = await this.getPosition(market);
        if (!position) return null;

        const order = await this.placeOrder({
            market: market.externalName,
            side: position.side === Side.Buy ? Side.Sell : Side.Buy,
            price: null,
            type: OrderType.Market,
            size: position.size,
            reduceOnly: false,
            timeInForce: TimeInForce.IOC,
            postOnly: false,
        });
        return order;
    }

    async cancelAllOrders(market?: Market): Promise<void> {
        const response: AxiosResponse<Response<string>> = await this.client(
            this.requestConfig(new CancelAllOrders({ market: market?.externalName }))
        );
        if (!response.data.success || !response.data.result || response.data.error) {
            throw new Error(response.data.error);
        }
    }

    async getOpenOrders(market?: Market): Promise<Order[]> {
        const response: AxiosResponse<Response<Order[]>> = await this.client(
            this.requestConfig(new GetOpenOrders({ market: market?.externalName }))
        );
        if (!response.data.success || !response.data.result || response.data.error) {
            throw new Error(response.data.error);
        }
        return response.data.result;
    }

    async getOrderbook(externalName: string, depth?: number) {
        const response: AxiosResponse<Response<Orderbook>> = await this.client(
            this.requestConfig(new GetOrderbook({ marketName: externalName, depth }))
        );
        if (!response.data.success || !response.data.result || response.data.error) {
            throw new Error(response.data.error);
        }
        return response.data.result;
    }
}
