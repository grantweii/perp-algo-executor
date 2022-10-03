import { Method } from 'axios';
import { Position, Side } from '../../common';
import { Request } from '../../interface';

export type FtxPosition = {
    future: string;
    size: number;
    side: Side;
    netSize: number;
    longOrderSize: number;
    shortOrderSize: number;
    cost: number;
    entryPrice: number;
    unrealizedPnl: number;
    realizedPnl: number;
    initialMarginRequirement: number;
    maintenanceMarginRequirement: number;
    openSize: number;
    collateralUsed: number;
    estimatedLiquidationPrice: number;
};

export class GetPosition implements Request {
    METHOD: Method = 'GET';
    PATH: string = '/positions';
    AUTH: boolean = true;

    getParams = () => null;

    static deserialize(response: FtxPosition): Position {
        return {
            market: response.future,
            size: response.size,
            side: response.side,
            entryPrice: response.entryPrice,
            unrealizedPnl: response.unrealizedPnl,
            liquidationPrice: response.estimatedLiquidationPrice,
        };
    }
}
