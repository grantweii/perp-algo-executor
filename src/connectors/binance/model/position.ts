import { Method } from 'axios';
import { Market, Position, Side } from '../../common';
import { Request } from '../../interface';

export type BinancePosition = {
    entryPrice: string;
    liquidationPrice: string;
    positionAmt: string;
    symbol: string;
    unRealizedProfit: string;
};

type GetPositionRequest = {
    symbol: string;
    timestamp: number;
};

export class GetPosition implements Request {
    METHOD: Method = 'GET';
    PATH: string = '/fapi/v2/positionRisk';
    AUTH: boolean = true;
    private request: GetPositionRequest;

    constructor(market: Market) {
        this.request = {
            symbol: market.externalName,
            timestamp: Date.now(),
        };
    }

    getParams = () => this.request;

    static deserialize(response: BinancePosition[]): Position | null {
        const size = Number(response[0].positionAmt);
        if (!size) return null;
        return {
            market: response[0].symbol,
            size: Math.abs(size),
            side: size > 0 ? Side.Buy : Side.Sell,
            entryPrice: Number(response[0].entryPrice),
            unrealizedPnl: Number(response[0].unRealizedProfit),
            liquidationPrice: Number(response[0].liquidationPrice),
        };
    }
}
