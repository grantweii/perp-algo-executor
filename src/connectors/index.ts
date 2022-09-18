import { Market } from './common';
import { FtxClient } from './ftx';
import FtxHelpers from './ftx/helpers';
import { Exchange, HttpClient } from './interface';

export * from './ftx';

export async function getHttpClient(
    exchange: Exchange,
    requestedMarkets: Market[]
): Promise<HttpClient> {
    switch (exchange) {
        case Exchange.Ftx: {
            const parameters = FtxHelpers.getFtxParameters();
            const ftxClient = new FtxClient(parameters);
            await ftxClient.init(requestedMarkets);
            return ftxClient;
        }
    }
}
