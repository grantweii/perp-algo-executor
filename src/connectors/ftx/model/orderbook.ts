import { Method } from 'axios';
import { Request } from '../../interface';

type GetOrderbookRequest = {
    marketName: string;
    depth?: number;
};

export class GetOrderbook implements Request {
    METHOD: Method = 'GET';
    // PATH: string = '/markets/{}/orderbook';
    AUTH: boolean = false;
    private request: GetOrderbookRequest;

    constructor(request: GetOrderbookRequest) {
        this.request = request;
    }

    get PATH() {
        return `/markets/${this.request.marketName}/orderbook`;
    }

    getParams = () => this.request;
}
