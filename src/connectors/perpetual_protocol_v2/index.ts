import { Markets, PerpetualProtocol, PositionSide } from '@perp/sdk-curie';
import { Wallet, providers } from 'ethers';
import Metadata from '@perp/curie-deployments/optimism/core/metadata.json';
import { Market, Side } from '../common';
import { PlacePerpV2Order } from './model/order';
import Big from 'big.js';

const DEFAULT_OPTIMISM_RPC_URL = 'https://mainnet.optimism.io';

export type PerpV2Parameters = {
    privateKey: string;
    rpcUrl?: string;
};

export class PerpV2Client {
    private readonly client: PerpetualProtocol;
    private readonly rpcUrl: string;
    private readonly wallet: Wallet;

    constructor({ privateKey, rpcUrl = DEFAULT_OPTIMISM_RPC_URL }: PerpV2Parameters) {
        this.client = new PerpetualProtocol({
            chainId: 10,
            providerConfigs: [{ rpcUrl }],
        });
        this.rpcUrl = rpcUrl;
        const provider = new providers.JsonRpcProvider(rpcUrl);
        this.wallet = new Wallet(privateKey, provider);
    }

    async init(requestedMarkets: Market[]) {
        await this.client.init();
        await this.client.connect({ signer: this.wallet });

        for (const market of requestedMarkets) {
            if (!new Object(Metadata.contracts).hasOwnProperty(`v${market.baseToken}`)) {
                throw new Error(`${market.baseToken} is not a valid token`);
            }
        }
    }

    async placeOrder(params: PlacePerpV2Order) {
        if (!this.client.clearingHouse)
            throw new Error('Perp client Clearinghouse has not been instantiated');
        const positionDraft = await this.client.clearingHouse.createPositionDraft({
            tickerSymbol: params.market.internalName, // TODO: check if correct
            side: params.side === Side.Buy ? PositionSide.LONG : PositionSide.SHORT,
            amountInput: new Big(params.size),
            isAmountInputBase: true,
        });
        const tx = this.client.clearingHouse.openPosition(positionDraft, new Big(params.slippage));
        return tx;
    }

    async closePosition(market: Market, slippage: number) {
        if (!this.client.positions)
            throw new Error('Perp client Positions has not been instantiated');
        if (!this.client.clearingHouse)
            throw new Error('Perp client Clearinghouse has not been instantiated');
        const position = await this.client.positions.getTakerPositionByTickerSymbol(
            market.internalName
        );
        if (!position)
            throw new Error(`Perp position does not exist for market ${market.internalName}`);
        const tx = await this.client.clearingHouse.closePosition(position, new Big(slippage));
        return tx;
    }

    async getPosition(market: Market) {
        if (!this.client.positions)
            throw new Error('Perp client Positions has not been instantiated');
        const position = await this.client.positions.getTakerPositionByTickerSymbol(
            market.internalName
        );
        return position || null;
    }

    async getPrice(market: Market) {
        if (!this.client.clearingHouse)
            throw new Error('Perp client Clearinghouse has not been instantiated');
            // up to here
        const perpMarket = (Metadata.contracts as any)[`v${market.baseToken}`];
        const price = await this.client.markets.getMarket({ tickerSymbol: perpMarket. })

    }
}
