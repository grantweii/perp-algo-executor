import { getHttpClient, getMarket, getPerpV2Client } from './connectors';
import PerpV2Helpers from './connectors/perpetual_protocol_v2/helpers';

import HedgedAlgoEngine from './strategies/algo/hedged';
import { Market } from './connectors/common';
import { getConfig } from './setup';
import { Direction, AlgoEngineParameters, HedgeInfo } from './strategies/interface';
import UnhedgedAlgoEngine from './strategies/algo/unhedged';
require('dotenv').config();

async function main() {
    const config = getConfig();
    const perpMarkets: Market[] = config.map((cfg) =>
        PerpV2Helpers.getMarket(cfg.baseToken)
    );
    const perpClient = await getPerpV2Client(perpMarkets);

    for (const cfg of config) {
        const perpMarket = PerpV2Helpers.getMarket(cfg.baseToken);

        let hedge: HedgeInfo | undefined;
        if (cfg.hedgeParams) {
            const hedgeMarket = getMarket(
                cfg.hedgeParams.exchange,
                cfg.baseToken,
                cfg.hedgeParams.quoteToken
            );
            const hedgeClient = await getHttpClient(cfg.hedgeParams.exchange, [hedgeMarket]);
            hedge = {
                enabled: cfg.hedgeParams.enabled,
                market: hedgeMarket,
                client: hedgeClient,
                direction:
                    cfg.perpDirection === Direction.Long ? Direction.Short : Direction.Long,
            };
        }

        const algoEngineParams: AlgoEngineParameters = {
            hedge,
            perp: { client: perpClient, market: perpMarket, direction: cfg.perpDirection },
            executionParams: cfg.executionParams,
            totalNotional: cfg.totalNotional,
            closeOnly: cfg.closeOnly,
            pollInterval: cfg.pollInterval,
            slippage: cfg.slippage,
            acceptableDifference: cfg.acceptableDifference,
        };
        if (hedge?.enabled) {
            const hedgedAlgoEngine = new HedgedAlgoEngine(algoEngineParams);
            await hedgedAlgoEngine.init();
        } else {
            const unhedgedAlgoEngine = new UnhedgedAlgoEngine(algoEngineParams);
            await unhedgedAlgoEngine.init();
        }
    }
}

main()
    .then()
    .catch((err) => {
        console.log(`Failed to run algo engine. Error: ${err.message}`);
        process.exit(1);
    });
