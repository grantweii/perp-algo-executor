import { BinanceFuturesClient } from './binance';
import BinanceHelpers from './binance/helpers';
import { Exchange, Market, MarketType } from './common';
import { FtxClient } from './ftx';
import FtxHelpers from './ftx/helpers';
import { HttpClient } from './interface';
import { PerpV2Client } from './perpetual_protocol_v2';
import PerpV2Helpers from './perpetual_protocol_v2/helpers';

export async function getHttpClient(
    exchange: Exchange,
    requestedMarkets: Market[]
): Promise<HttpClient> {
    switch (exchange) {
        case Exchange.Ftx: {
            const parameters = FtxHelpers.getParameters();
            const ftxClient = new FtxClient(parameters);
            await ftxClient.init(requestedMarkets);
            return ftxClient;
        }
        case Exchange.Binance: {
            const parameters = BinanceHelpers.getParameters();
            const binanceFuturesClient = new BinanceFuturesClient(parameters);
            await binanceFuturesClient.init(requestedMarkets);
            return binanceFuturesClient;
        }
        case Exchange.PerpetualProtocolV2: {
            throw new Error('Please instantiate the Perp V2 client using getPerpV2Client');
        }
    }
}

export function getMarket(exchange: Exchange, baseToken: string, quoteToken: string) {
    switch (exchange) {
        case Exchange.Ftx: {
            return FtxHelpers.getMarket(baseToken, MarketType.Future);
        }
        case Exchange.Binance: {
            return BinanceHelpers.getMarket(baseToken, quoteToken, MarketType.Future);
        }
        case Exchange.PerpetualProtocolV2: {
            return PerpV2Helpers.getMarket(baseToken);
        }
    }
}

export async function getPerpV2Client(requestedMarkets: Market[]) {
    const parameters = PerpV2Helpers.getParameters();
    const perpClient = new PerpV2Client(parameters);
    await perpClient.init(requestedMarkets);
    return perpClient;
}