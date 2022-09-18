import { Method } from 'axios';
import { Order } from '../../common';
import { Request } from '../../interface';
import { PlaceOrder as GenericPlaceOrder } from '../../common';

export type FtxOrder = Order;

export class PlaceOrder implements Request {
    METHOD: Method = 'POST';
    PATH: string = '/orders';
    AUTH: boolean = true;
    private request: GenericPlaceOrder;

    constructor(request: GenericPlaceOrder) {
        this.request = request;
    }

    getParams = () => this.request;
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
