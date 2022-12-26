import { Market } from '../../connectors/common';
import { HttpClient } from '../../connectors/interface';
import { PerpV2Client } from '../../connectors/perpetual_protocol_v2';
import { signed_percentage_difference_as_bps } from '../../utils/math';
import {
    CanExecuteResponse,
    Direction,
    FundingExecution,
    SpreadParameters,
} from '../interface';

type SpreadExecutionParameters = {
    spread: SpreadParameters;
    perpClient: PerpV2Client;
    hedgeClient: HttpClient;
    perpDirection: Direction;
    hedgeDirection: Direction;
    perpMarket: Market;
    hedgeMarket: Market;
};

export class Spread implements FundingExecution {
    private readonly perpClient: PerpV2Client;
    private readonly hedgeClient: HttpClient;
    private readonly minSpread: number;
    private readonly perpDirection: Direction;
    private readonly hedgeDirection: Direction;
    private readonly perpMarket: Market;
    private readonly hedgeMarket: Market;
    readonly orderNotional: number;

    constructor(params: SpreadExecutionParameters) {
        this.perpClient = params.perpClient;
        this.hedgeClient = params.hedgeClient;
        this.orderNotional = params.spread.orderNotional;
        this.minSpread = params.spread.minSpread;
        this.perpDirection = params.perpDirection;
        this.hedgeDirection = params.hedgeDirection;
        this.perpMarket = params.perpMarket;
        this.hedgeMarket = params.hedgeMarket;
    }

    async canExecute(): Promise<CanExecuteResponse> {
        const perpQuote = await this.perpClient.quote({
            market: this.perpMarket,
            direction: this.perpDirection,
            amount: this.orderNotional,
            amountType: 'quote',
        });
        const hedgeQuote = await this.hedgeClient.quote({
            market: this.hedgeMarket,
            orderNotional: this.orderNotional,
            direction: this.hedgeDirection,
        });
        let shortPrice, longPrice;
        if (this.perpDirection === Direction.Short) {
            shortPrice = perpQuote.averagePrice;
            longPrice = hedgeQuote.averagePrice;
        } else {
            shortPrice = hedgeQuote.averagePrice;
            longPrice = perpQuote.averagePrice;
        }
        const spread = signed_percentage_difference_as_bps(shortPrice, longPrice);
        console.log(`${this.perpMarket.baseToken} - SPREAD: ${spread}. Perp price: ${perpQuote.averagePrice}. Hedge price: ${hedgeQuote.averagePrice}`);
        const minSize = this.hedgeClient.marketInfo[this.hedgeMarket.externalName].minSize;
        if (perpQuote.orderSize < minSize) {
            console.log(`${this.perpMarket.baseToken} - Cannot execute. Order size [${perpQuote.orderSize}] < Hedge market min size [${minSize}]`);
            return false;
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
