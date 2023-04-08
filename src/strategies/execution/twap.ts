import { generateRandomBetween } from '../../utils/math';
import { HedgeInfo, PerpInfo } from '../interface';
import { CanExecuteResponse, Execution, TwapParameters } from './interface';

function determinePeriodInMs(period: string): number {
    if (period.endsWith('d')) {
        const substring = period.split('d');
        const numeric = Number(substring[0]);
        if (isNaN(numeric)) throw new Error(`'${substring[0]}' is not a number`);
        return numeric * 86400000;
    } else if (period.endsWith('h')) {
        const substring = period.split('h');
        const numeric = Number(substring[0]);
        if (isNaN(numeric)) throw new Error(`'${substring[0]}' is not a number`);
        return numeric * 3600000;
    } else if (period.endsWith('m')) {
        const substring = period.split('m');
        const numeric = Number(substring[0]);
        if (isNaN(numeric)) throw new Error(`'${substring[0]}' is not a number`);
        return numeric * 60000;
    } else {
        throw new Error(
            `Invalid period ${period}. Please provide in following format eg. '30m' (30 mins), '4h' (4 hrs), '1d' (1 day)`
        );
    }
}

type TwapExecutionParameters = {
    twap: TwapParameters;
    hedge?: HedgeInfo;
    perp: PerpInfo;
    totalNotional: number;
    hideSize: boolean;
};

export class Twap implements Execution {
    private readonly hedge?: HedgeInfo;
    private readonly perp: PerpInfo;
    private readonly period: number; // in ms
    private readonly totalNotional: number;
    private readonly parts: number;
    private readonly hideSize: boolean;
    orderNotional: number;
    private last: number | null = null; // in ms

    constructor(params: TwapExecutionParameters) {
        this.orderNotional = params.totalNotional / params.twap.parts;
        this.period = determinePeriodInMs(params.twap.period) / params.twap.parts;
        this.perp = params.perp;
        this.hedge = params.hedge;
        this.totalNotional = params.totalNotional;
        this.parts = params.twap.parts;
        this.hideSize = params.hideSize;
    }

    async canExecute(): Promise<CanExecuteResponse> {
        if (!this.last || Date.now() - this.last >= this.period) {
            const desiredNotional = this.hideSize
                ? generateRandomBetween(0.9, 1.1) * this.orderNotional
                : this.orderNotional;
            const perpQuote = await this.perp.client.quote({
                market: this.perp.market,
                direction: this.perp.direction,
                amount: desiredNotional,
                amountType: 'quote',
            });
            if (this.hedge?.enabled) {
                const minSize =
                    this.hedge.client.marketInfo[this.hedge.market.externalName].minSize;
                if (perpQuote.orderSize < minSize) {
                    console.log(
                        `${this.perp.market.baseToken} - Cannot execute. Order size [${perpQuote.orderSize}] < Hedge market min size [${minSize}]`
                    );
                    return false;
                }
            }
            return {
                orderSize: perpQuote.orderSize,
                price: perpQuote.averagePrice,
            };
        }
        const remainingInMs = this.last + this.period - Date.now();
        const remainingMins = Math.floor(remainingInMs / 1000 / 60);
        const remainingSecs = (remainingInMs / 1000) % 60;
        console.log(
            `${this.perp.market.baseToken} - TWAP - Remaining: ${remainingMins}m ${remainingSecs}s`
        );
        return false;
    }

    onSuccess() {
        this.last = Date.now();
    }
}
