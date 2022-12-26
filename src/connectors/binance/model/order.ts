import { Method } from 'axios';
import { Request } from '../../interface';
import {
    Market,
    Order,
    OrderStatus,
    OrderType,
    PlaceOrder as GenericPlaceOrder,
    Side,
    TimeInForce,
} from '../../common';
import dayjs from 'dayjs';

enum ResponseType {
    Ack = 'ACK',
    Result = 'RESULT',
}

type BinancePlaceOrder = {
    symbol: string;
    side: string; // uppercase
    type: string; // uppercase
    timeInForce?: string;
    quantity?: number;
    reduceOnly?: boolean;
    price?: number | null;
    newClientOrderId?: string;
    newOrderRespType: ResponseType;
    timestamp: number;
    closePosition?: boolean;
};

export type BinanceOrder = {
    symbol: string;
    orderId: number;
    clientOrderId: string;
    price: string;
    origQty: string;
    cumQuote: string;
    executedQty: string;
    status: string;
    timeInForce: string;
    type: string;
    side: string;
    updateTime: number;
    closePosition: boolean;
    reduceOnly: boolean;
};

export class PlaceOrder implements Request {
    METHOD: Method = 'POST';
    PATH: string = '/fapi/v1/order';
    AUTH: boolean = true;
    private request: BinancePlaceOrder;

    constructor(request: GenericPlaceOrder) {
        let timeInForce: string | undefined;
        if (request.postOnly) {
            timeInForce = 'GTX';
        } else if (request.type === OrderType.Limit) {
            timeInForce = (request.timeInForce || TimeInForce.GTC).toUpperCase();
        }
        this.request = {
            symbol: request.market,
            side: request.side.toUpperCase(),
            type: request.type.toUpperCase(),
            timeInForce,
            quantity: request.size,
            reduceOnly: request.reduceOnly,
            price: request.price,
            newClientOrderId: request.clientOrderId,
            newOrderRespType: ResponseType.Result,
            timestamp: Date.now(),
        };
    }

    getParams = () => this.request;

    static deserialize(response: BinanceOrder): Order {
        let timeInForce = response.timeInForce;
        let postOnly = false;
        if (response.timeInForce === 'GTX') {
            timeInForce = TimeInForce.GTC;
            postOnly = true;
        }
        return {
            updateTime: dayjs(response.updateTime),
            filledSize: Number(response.executedQty),
            id: response.orderId,
            market: response.symbol,
            price: Number(response.price) || null,
            remainingSize: Number(response.origQty) - Number(response.executedQty),
            side: response.side.toLowerCase() as Side,
            size: Number(response.origQty),
            status: response.status.toLowerCase() as OrderStatus,
            type: response.type.toLowerCase() as OrderType,
            reduceOnly: response.reduceOnly,
            timeInForce: timeInForce.toLowerCase() as TimeInForce,
            postOnly,
            clientOrderId: response.clientOrderId,
        };
    }
}

export type CancelAllOrdersResponse = {
    code: string;
    msg: string;
};

type CancelAllOrdersRequest = {
    symbol?: string;
    timestamp: number;
};

export class CancelAllOrders implements Request {
    METHOD: Method = 'DELETE';
    PATH: string = '/fapi/v1/allOpenOrders';
    AUTH: boolean = true;
    private request: CancelAllOrdersRequest;

    constructor(market?: Market) {
        this.request = {
            timestamp: Date.now(),
            symbol: market?.externalName,
        };
    }

    getParams = () => this.request;
}

type GetOpenOrdersRequest = {
    symbol?: string;
    timestamp: number;
};

export class GetOpenOrders implements Request {
    METHOD: Method = 'GET';
    PATH: string = '/fapi/v1/openOrders';
    AUTH: boolean = true;
    private request: GetOpenOrdersRequest | null;

    constructor(market?: Market) {
        this.request = {
            symbol: market?.externalName,
            timestamp: Date.now(),
        }
    }

    getParams = () => this.request;

    static deserialize(response: BinanceOrder[]): Order[] {
        return response.map((order) => {
            let timeInForce = order.timeInForce;
            let postOnly = false;
            if (order.timeInForce === 'GTX') {
                timeInForce = TimeInForce.GTC;
                postOnly = true;
            }
            return {
                updateTime: dayjs(order.updateTime),
                filledSize: Number(order.executedQty),
                id: order.orderId,
                market: order.symbol,
                price: Number(order.price),
                remainingSize: Number(order.origQty) - Number(order.executedQty),
                side: order.side.toLowerCase() as Side,
                size: Number(order.origQty),
                status: order.status.toLowerCase() as OrderStatus,
                type: order.type.toLowerCase() as OrderType,
                reduceOnly: order.reduceOnly,
                timeInForce: timeInForce as TimeInForce,
                postOnly,
                clientOrderId: order.clientOrderId,
            }
        })
    }
}
