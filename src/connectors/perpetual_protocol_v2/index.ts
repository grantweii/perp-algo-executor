import { PerpetualProtocol, PositionSide } from '@perp/sdk-curie';
import { Wallet, providers } from 'ethers';
import Metadata from '@perp/curie-deployments/optimism/core/metadata.json';
import { Market, Quote } from '../common';
import { GetQuote, PlacePerpV2Order } from './model/order';
import Big from 'big.js';
import { bpsToNatural } from '../../utils/math';
import { Direction } from '../../strategies/interface';

const DEFAULT_OPTIMISM_RPC_URL = 'https://mainnet.optimism.io';

export type PerpV2Parameters = {
    privateKey: string;
    rpcUrl?: string;
};

export class PerpV2Client {
    private readonly client: PerpetualProtocol;
    private readonly wallet: Wallet;

    constructor({ privateKey, rpcUrl = DEFAULT_OPTIMISM_RPC_URL }: PerpV2Parameters) {
        this.client = new PerpetualProtocol({
            chainId: 10,
            providerConfigs: [{ rpcUrl }],
        });
        const provider = new providers.JsonRpcProvider(rpcUrl);
        this.wallet = new Wallet(privateKey, provider);
    }

    async init(requestedMarkets: Market[]) {
        await this.client.init();
        await this.client.connect({ signer: this.wallet });

        for (const market of requestedMarkets) {
            if (!new Object(Metadata.contracts).hasOwnProperty(`v${market.baseToken}`)) {
                throw new Error(`Failed to initiliase perp v2 client. ${market.baseToken} is not a valid base token`);
            }
            if (market.quoteToken !== 'USD') {
                throw new Error(`Failed to initiliase perp v2 client. ${market.quoteToken} is not a valid quote token`);
            }
        }
    }

    async placeOrder(params: PlacePerpV2Order) {
        if (!this.client.clearingHouse)
            throw new Error('Perp client Clearinghouse has not been instantiated');
        const positionDraft = this.client.clearingHouse.createPositionDraft({
            tickerSymbol: params.market.internalName,
            side: params.direction === Direction.Long ? PositionSide.LONG : PositionSide.SHORT,
            amountInput: new Big(params.size),
            isAmountInputBase: true,
        });
        const slippageAsNatural = params.slippage ? bpsToNatural(params.slippage) : 0;
        const tx = await this.client.clearingHouse.openPosition(positionDraft, new Big(slippageAsNatural));
        return tx.transaction.wait(2);
    }

    async closePosition(market: Market, slippage?: number) {
        if (!this.client.positions)
            throw new Error('Perp client Positions has not been instantiated');
        if (!this.client.clearingHouse)
            throw new Error('Perp client Clearinghouse has not been instantiated');
        const position = await this.client.positions.getTakerPositionByTickerSymbol(
            market.internalName,
        );
        if (!position)
            throw new Error(`Perp position does not exist for market ${market.internalName}`);
        const tx = await this.client.clearingHouse.closePosition(position, new Big(slippage || 0));
        return tx.transaction.wait(2);
    }

    async getPosition(market: Market) {
        if (!this.client.positions)
            throw new Error('Perp client Positions has not been instantiated');
        const position = await this.client.positions.getTakerPositionByTickerSymbol(
            market.internalName,
            { cache: false }
        );
        return position || null;
    }

    async getMarkPrice(market: Market) {
        if (!this.client.clearingHouse)
            throw new Error('Perp client Clearinghouse has not been instantiated');
        const perpMarket = this.client.markets.getMarket({ tickerSymbol: market.internalName });
        const prices = await perpMarket.getPrices();
        return prices.markPrice.toNumber();
    }

    async quote(params: GetQuote): Promise<Quote> {
        let isExactInput;
        if (params.amountType === 'base') {
            if (params.direction === Direction.Long) {
                isExactInput = false;
            } else {
                isExactInput = true;
            }
        } else {
            if (params.direction === Direction.Long) {
                isExactInput = true;
            } else  {
                isExactInput = false;
            }
        }
        const simulated = await this.client.contractReader.simulateOpenPosition({
            baseTokenAddress: this.client.markets.marketMap[params.market.internalName].baseAddress,
            isBaseToQuote: params.direction === Direction.Long ? false : true,
            isExactInput,
            amount: new Big(params.amount),
            oppositeAmountBound: new Big(0),
        });
        return {
            averagePrice: simulated.deltaQuote.div(simulated.deltaBase).toNumber(),
            orderSize: simulated.deltaBase.toNumber(),
        }
    }
}
