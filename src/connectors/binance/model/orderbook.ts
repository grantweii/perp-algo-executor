import { Method } from 'axios';
import { Request } from '../../interface';

type GetOrderbookRequest = {
    symbol: string;
    limit?: number;
};

export class GetOrderbook implements Request {
    METHOD: Method = 'GET';
    PATH: string = '/fapi/v1/depth';
    AUTH: boolean = false;
    private request: GetOrderbookRequest;

    constructor(request: GetOrderbookRequest) {
        this.request = request;
    }

    getParams = () => this.request;
}
