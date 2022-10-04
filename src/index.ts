import { getHttpClient, getMarket, getPerpV2Client } from './connectors';
import { Exchange } from './connectors/interface';
import PerpV2Helpers from './connectors/perpetual_protocol_v2/helpers';
import {
    Direction,
    ExecutionParameters,
    ExecutionType,
    FundingRateConfig,
} from './strategies/interface';
import FundingRateArbEngine from './strategies/funding_rate';
import Config from './config.json';
require('dotenv').config();

const getFundingConfigs = () => {
    const fundingConfigs = [];
    for (const [market, config] of Object.entries(
        Config as unknown as Record<string, FundingRateConfig>
    )) {
        if (!config.STRATEGY) throw new Error(`STRATEGY must be provided in the config`);
        if (!config.HEDGE_EXCHANGE)
            throw new Error(`HEDGE_EXCHANGE must be provided in the config`);
        if (!Object.values(Exchange).includes(config.HEDGE_EXCHANGE)) {
            throw new Error(`HEDGE_EXCHANGE must be one of ${Object.values(Exchange).join(', ')}`);
        }
        if (!config.TOTAL_NOTIONAL)
            throw new Error(`TOTAL_NOTIONAL must be provided in the config`);
        if (!config.PERP_DIRECTION)
            throw new Error(`PERP_DIRECTION must be provided in the config`);
        if (![Direction.Long, Direction.Short].includes(config.PERP_DIRECTION)) {
            throw new Error(`PERP_DIRECTION must be either 'long' or 'short'`);
        }
        let executionParams: ExecutionParameters;
        if (config.STRATEGY === ExecutionType.Spread) {
            if (!config.MIN_SPREAD)
                throw new Error(`MIN_SPREAD must be provided in the config for 'spread' strategy`);
            if (!config.ORDER_NOTIONAL)
                throw new Error(
                    `ORDER_NOTIONAL must be provided in the config for 'spread' strategy`
                );
            executionParams = {
                strategy: ExecutionType.Spread,
                minSpread: config.MIN_SPREAD,
                orderNotional: config.ORDER_NOTIONAL,
            };
        } else if (config.STRATEGY === ExecutionType.Twap) {
            if (!config.PARTS)
                throw new Error(`PARTS must be provided in the config for 'twap' strategy`);
            if (!config.PERIOD)
                throw new Error(`PERIOD must be provided in the config for 'twap' strategy`);
            executionParams = {
                strategy: ExecutionType.Twap,
                parts: Number(config.PARTS),
                period: config.PERIOD,
            };
        } else {
            throw new Error(`STRATEGY must be either 'spread' or 'twap'`);
        }
        fundingConfigs.push({
            baseToken: market,
            hedgeExchange: config.HEDGE_EXCHANGE,
            executionParams,
            totalNotional: config.TOTAL_NOTIONAL,
            perpDirection: config.PERP_DIRECTION,
            closeOnly: config.CLOSE_ONLY,
            pollInterval: config.POLL_INTERVAL,
            slippage: config.SLIPPAGE,
        });
    }
    return fundingConfigs;
};

async function main() {
    const fundingConfigs = getFundingConfigs();
    for (const config of fundingConfigs) {
        const perpMarket = PerpV2Helpers.getMarket(config.baseToken);
        const hedgeMarket = getMarket(config.hedgeExchange, config.baseToken);
        const perpClient = await getPerpV2Client([perpMarket]);
        const hedgeClient = await getHttpClient(config.hedgeExchange, [hedgeMarket]);
        const fundingRateArbEngine = new FundingRateArbEngine({
            hedgeClient,
            perpClient,
            perpMarket,
            hedgeMarket,
            executionParams: config.executionParams,
            totalNotional: config.totalNotional,
            perpDirection: config.perpDirection,
            closeOnly: config.closeOnly,
            pollInterval: config.pollInterval,
            slippage: config.slippage,
        });
        await fundingRateArbEngine.init();
    }
}

main()
    .then()
    .catch((err) => {
        console.log(`Failed to run funding arb. Error: ${err.message}`);
        process.exit(1);
    });
