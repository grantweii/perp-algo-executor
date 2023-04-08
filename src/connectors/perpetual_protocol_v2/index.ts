import { bigNumber2BigAndScaleDown, PerpetualProtocol, PositionSide } from '@perp/sdk-curie';
import { Wallet, providers, Contract } from 'ethers';
import Metadata from '@perp/curie-deployments/optimism/core/metadata.json';
import { Direction, Market, Quote } from '../common';
import { GetQuote, PlacePerpV2Order } from './model/order';
import Big from 'big.js';
import { bpsToNatural } from '../../utils/math';
import ClearingHouseABI from '@perp/curie-deployments/optimism/core/artifacts/contracts/ClearingHouse.sol/ClearingHouse.json';

const DEFAULT_OPTIMISM_HTTP_RPC_URL = 'https://mainnet.optimism.io';
const DEFAULT_OPTIMISM_WS_RPC_URL = 'wss://ws-mainnet.optimism.io';

export type PositionChangedEvent = {
    trader: string;
    baseToken: string;
    exchangedPositionSize: number;
    exchangedPositionNotional: number;
    fee: number;
    openNotional: number;
    realizedPnl: number;
    sqrtPriceAfterX96: Big;
};

export type PerpV2Parameters = {
    privateKey: string;
    httpRpcUrl?: string;
    wsRpcUrl?: string;
};

export class PerpV2Client {
    private readonly client: PerpetualProtocol;
    readonly wallet: Wallet;
    private readonly wsRpcUrl: string;

    constructor({
        privateKey,
        httpRpcUrl = DEFAULT_OPTIMISM_HTTP_RPC_URL,
        wsRpcUrl = DEFAULT_OPTIMISM_WS_RPC_URL,
    }: PerpV2Parameters) {
        this.client = new PerpetualProtocol({
            chainId: 10,
            providerConfigs: [{ rpcUrl: httpRpcUrl }],
        });
        const provider = new providers.JsonRpcProvider(httpRpcUrl);
        this.wallet = new Wallet(privateKey, provider);
        this.wsRpcUrl = wsRpcUrl;
    }

    async init(requestedMarkets: Market[]) {
        await this.client.init();
        await this.client.connect({ signer: this.wallet });

        for (const market of requestedMarkets) {
            if (!new Object(Metadata.contracts).hasOwnProperty(`v${market.baseToken}`)) {
                throw new Error(
                    `Failed to initiliase perp v2 client. ${market.baseToken} is not a valid base token`
                );
            }
            if (market.quoteToken !== 'USD') {
                throw new Error(
                    `Failed to initiliase perp v2 client. ${market.quoteToken} is not a valid quote token`
                );
            }
        }
    }

    baseTokenAddress(market: Market): string | undefined {
        return (Metadata.contracts as any)[`v${market.baseToken}`]?.address;
    }

    async placeOrder(params: PlacePerpV2Order) {
        if (!this.client.clearingHouse)
            throw new Error('Perp client Clearinghouse has not been instantiated');
        const positionDraft = this.client.clearingHouse.createPositionDraft({
            tickerSymbol: params.market.externalName,
            side: params.direction === Direction.Long ? PositionSide.LONG : PositionSide.SHORT,
            amountInput: new Big(params.size),
            isAmountInputBase: true,
        });
        const slippageAsNatural = params.slippage ? bpsToNatural(params.slippage) : 0;
        const tx = await this.client.clearingHouse.openPosition(
            positionDraft,
            new Big(slippageAsNatural)
        );
        return tx.transaction.wait(2);
    }

    async closePosition(market: Market, slippage?: number) {
        if (!this.client.positions)
            throw new Error('Perp client Positions has not been instantiated');
        if (!this.client.clearingHouse)
            throw new Error('Perp client Clearinghouse has not been instantiated');
        const position = await this.client.positions.getTakerPositionByTickerSymbol(
            market.externalName
        );
        if (!position)
            throw new Error(`Perp position does not exist for market ${market.externalName}`);
        const tx = await this.client.clearingHouse.closePosition(position, new Big(slippage || 0));
        return tx.transaction.wait(2);
    }

    async getPosition(market: Market) {
        if (!this.client.positions)
            throw new Error('Perp client Positions has not been instantiated');
        const position = await this.client.positions.getTakerPositionByTickerSymbol(
            market.externalName,
            { cache: false }
        );
        return position || null;
    }

    async getMarkPrice(market: Market) {
        if (!this.client.clearingHouse)
            throw new Error('Perp client Clearinghouse has not been instantiated');
        const perpMarket = this.client.markets.getMarket({ tickerSymbol: market.externalName });
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
            } else {
                isExactInput = false;
            }
        }
        const simulated = await this.client.contractReader.simulateOpenPosition({
            baseTokenAddress: this.client.markets.marketMap[params.market.externalName].baseAddress,
            isBaseToQuote: params.direction === Direction.Long ? false : true,
            isExactInput,
            amount: new Big(params.amount),
            oppositeAmountBound: new Big(0),
        });
        return {
            averagePrice: simulated.deltaQuote.div(simulated.deltaBase).toNumber(),
            orderSize: simulated.deltaBase.toNumber(),
        };
    }

    async subscribePositionChangedEvent(callback: (params: PositionChangedEvent) => void) {
        const provider = new providers.WebSocketProvider(this.wsRpcUrl);
        const contract = new Contract(
            Metadata.contracts.ClearingHouse.address,
            ClearingHouseABI.abi,
            provider
        );
        contract.on(
            'PositionChanged',
            (
                trader,
                baseToken,
                exchangedPositionSize,
                exchangedPositionNotional,
                fee,
                openNotional,
                realizedPnl,
                sqrtPriceAfterX96
            ) => {
                callback({
                    trader,
                    baseToken,
                    exchangedPositionSize: bigNumber2BigAndScaleDown(
                        exchangedPositionSize,
                        18
                    ).toNumber(),
                    exchangedPositionNotional: bigNumber2BigAndScaleDown(
                        exchangedPositionNotional,
                        18
                    ).toNumber(),
                    fee: bigNumber2BigAndScaleDown(fee, 18).toNumber(),
                    openNotional: bigNumber2BigAndScaleDown(openNotional, 18).toNumber(),
                    realizedPnl: bigNumber2BigAndScaleDown(realizedPnl, 18).toNumber(),
                    sqrtPriceAfterX96: bigNumber2BigAndScaleDown(sqrtPriceAfterX96, 18),
                });
            }
        );
    }
}
