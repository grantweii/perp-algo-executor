import { Direction } from '../../connectors/common';
import { generateRandomBetween, signed_percentage_difference_as_bps } from '../../utils/math';
import { HedgeInfo, PerpInfo } from '../interface';
import { CanExecuteResponse, Execution, SpreadParameters } from './interface';

type SpreadExecutionParameters = {
    spread: SpreadParameters;
    hedge?: HedgeInfo;
    perp: PerpInfo;
    hideSize: boolean;
};

export class Spread implements Execution {
    private readonly hedge: HedgeInfo;
    private readonly perp: PerpInfo;
    private readonly minSpread: number;
    private readonly hideSize: boolean;
    readonly orderNotional: number;

    constructor(params: SpreadExecutionParameters) {
        if (!params.hedge) throw new Error('Hedge info is necessary for spread strategy');
        this.hedge = params.hedge;
        this.perp = params.perp;
        this.orderNotional = params.spread.orderNotional;
        this.minSpread = params.spread.minSpread;
        this.hideSize = params.hideSize;
    }

    async canExecute(): Promise<CanExecuteResponse> {
        const desiredNotional = this.hideSize
            ? generateRandomBetween(0.9, 1.1) * this.orderNotional
            : this.orderNotional;
        const perpQuote = await this.perp.client.quote({
            market: this.perp.market,
            direction: this.perp.direction,
            amount: desiredNotional,
            amountType: 'quote',
        });
        const hedgeQuote = await this.hedge.client.quote({
            market: this.hedge.market,
            orderNotional: desiredNotional,
            direction: this.hedge.direction,
        });
        let shortPrice, longPrice;
        if (this.perp.direction === Direction.Short) {
            shortPrice = perpQuote.averagePrice;
            longPrice = hedgeQuote.averagePrice;
        } else {
            shortPrice = hedgeQuote.averagePrice;
            longPrice = perpQuote.averagePrice;
        }
        const spread = signed_percentage_difference_as_bps(shortPrice, longPrice);
        console.log(
            `${this.perp.market.baseToken} - SPREAD: ${spread}. Perp price: ${perpQuote.averagePrice}. Hedge price: ${hedgeQuote.averagePrice}`
        );
        if (this.hedge.enabled) {
            const minSize = this.hedge.client.marketInfo[this.hedge.market.externalName].minSize;
            if (perpQuote.orderSize < minSize) {
                console.log(
                    `${this.perp.market.baseToken} - Cannot execute. Order size [${perpQuote.orderSize}] < Hedge market min size [${minSize}]`
                );
                return false;
            }
        }
        if (spread > this.minSpread) {
            return {
                orderSize: perpQuote.orderSize,
                price: perpQuote.averagePrice,
            };
        }
        return false;
    }

    onSuccess() {}
}
