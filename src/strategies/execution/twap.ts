import { Market } from '../../connectors/common';
import { PerpV2Client } from '../../connectors/perpetual_protocol_v2';
import {
    CanExecuteResponse,
    FundingExecution,
    TwapParameters,
} from '../interface';

function determinePeriodInMs(period: string): number {
    if (period.endsWith('d')) {
        const substring = period.split('d');
        // TODO: attempt to parse as number, fail if not
        return Number(substring[0]) * 86400000;
    } else if (period.endsWith('h')) {
        const substring = period.split('h');
        return Number(substring[0]) * 3600000;
    } else if (period.endsWith('m')) {
        const substring = period.split('m');
        return Number(substring[0]) * 60000;
    } else {
        throw new Error(
            `Invalid period ${period}. Please provide in following format eg. '30m' (30 mins), '4h' (4 hrs), '1d' (1 day)`
        );
    }
}

type TwapExecutionParameters = {
    twap: TwapParameters;
    perpClient: PerpV2Client;
    perpMarket: Market;
    totalNotional: number;
};

export class Twap implements FundingExecution {
    private readonly perpClient: PerpV2Client;
    private readonly orderNotional: number;
    private readonly period: number; // in ms
    private readonly perpMarket: Market;
    private last: number | null = null; // in ms

    constructor(params: TwapExecutionParameters) {
        this.orderNotional = params.totalNotional / params.twap.parts;
        this.period = determinePeriodInMs(params.twap.period);
        this.perpClient = params.perpClient;
        this.perpMarket = params.perpMarket;
    }

    async canExecute(): Promise<CanExecuteResponse> {
        if (!this.last || Date.now() - this.last >= this.period) {
            this.last = Date.now();
            const perpPrice = await this.perpClient.getMarkPrice(this.perpMarket);
            return {
                orderSize: this.orderNotional / perpPrice,
            };
        }
        return false;
    }
}
