import { signed_percentage_difference_as_bps } from '../../utils/math';
import {
    CanExecuteResponse,
    Direction,
    Execution,
    HedgeInfo,
    PerpInfo,
    SpreadParameters,
} from '../interface';

type SpreadExecutionParameters = {
    spread: SpreadParameters;
    hedge?: HedgeInfo;
    perp: PerpInfo;
};

export class Spread implements Execution {
    private readonly hedge: HedgeInfo;
    private readonly perp: PerpInfo;
    private readonly minSpread: number;
    readonly orderNotional: number;

    constructor(params: SpreadExecutionParameters) {
        if (!params.hedge) throw new Error('Hedge info is necessary for spread strategy');
        this.hedge = params.hedge;
        this.perp = params.perp;
        this.orderNotional = params.spread.orderNotional;
        this.minSpread = params.spread.minSpread;
    }

    async canExecute(): Promise<CanExecuteResponse> {
        const perpQuote = await this.perp.client.quote({
            market: this.perp.market,
            direction: this.perp.direction,
            amount: this.orderNotional,
            amountType: 'quote',
        });
        const hedgeQuote = await this.hedge.client.quote({
            market: this.hedge.market,
            orderNotional: this.orderNotional,
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
        console.log(`${this.perp.market.baseToken} - SPREAD: ${spread}. Perp price: ${perpQuote.averagePrice}. Hedge price: ${hedgeQuote.averagePrice}`);
        if (this.hedge.enabled) {
            const minSize = this.hedge.client.marketInfo[this.hedge.market.externalName].minSize;
            if (perpQuote.orderSize < minSize) {
                console.log(`${this.perp.market.baseToken} - Cannot execute. Order size [${perpQuote.orderSize}] < Hedge market min size [${minSize}]`);
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
