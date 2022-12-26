import { Method } from 'axios';
import { Order, OrderStatus, OrderType, Side, TimeInForce } from '../../common';
import { Request } from '../../interface';
import { PlaceOrder as GenericPlaceOrder } from '../../common';
import dayjs from 'dayjs';

type FtxPlaceOrder = {
    market: string;
    side: Side;
    price?: number | null;
    type: OrderType;
    size: number;
    reduceOnly: boolean;
    ioc: boolean;
    postOnly: boolean;
    clientId?: string;
}

export type FtxOrder = {
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
}

export class PlaceOrder implements Request {
    METHOD: Method = 'POST';
    PATH: string = '/orders';
    AUTH: boolean = true;
    private request: FtxPlaceOrder;

    constructor(request: GenericPlaceOrder) {
        this.request = {
            market: request.market,
            side: request.side,
            price: request.price,
            type: request.type,
            size: request.size,
            reduceOnly: request.reduceOnly,
            postOnly: request.postOnly,
            clientId: request.clientOrderId,
            ioc: request.timeInForce === TimeInForce.IOC,
        }
    }

    getParams = () => this.request;

    static deserialize(response: FtxOrder): Order {
        return {
            updateTime: dayjs(response.createdAt),
            filledSize: response.filledSize,
            id: response.id,
            market: response.market,
            price: response.price,
            remainingSize: response.remainingSize,
            side: response.side as Side,
            size: response.size,
            status: response.status as OrderStatus,
            type: response.type as OrderType,
            reduceOnly: response.reduceOnly,
            timeInForce: response.ioc ? TimeInForce.IOC : TimeInForce.GTC,
            postOnly: response.postOnly,
            clientOrderId: response.clientId,
        };
    }
}

type CancelAllOrdersRequest = {
    market?: string;
};

export class CancelAllOrders implements Request {
    METHOD: Method = 'DELETE';
    PATH: string = '/orders';
    AUTH: boolean = true;
    private request: CancelAllOrdersRequest | null;

    constructor(request?: CancelAllOrdersRequest) {
        this.request = request || null;
    }

    getParams = () => this.request;
}

type GetOpenOrdersRequest = {
    market?: string;
};

export class GetOpenOrders implements Request {
    METHOD: Method = 'GET';
    PATH: string = '/orders';
    AUTH: boolean = true;
    private request: GetOpenOrdersRequest | null;

    constructor(request?: GetOpenOrdersRequest) {
        this.request = request || null;
    }

    getParams = () => this.request;
}
