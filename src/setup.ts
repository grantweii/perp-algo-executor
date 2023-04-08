import {
    Direction,
    ExecutionParameters,
    ExecutionType,
    AlgoEngineConfig,
    HedgeParameters,
} from './strategies/interface';
import Config from './config.json';
import { Exchange } from './connectors/common';
import { isNil } from './utils/common';

function validateHedgeParams(config: AlgoEngineConfig): HedgeParameters {
    if (!config?.HEDGE?.EXCHANGE)
        throw new Error(
            `HEDGE.EXCHANGE must be provided in the config`
        );
    if (!config?.HEDGE?.QUOTE_TOKEN)
        throw new Error(
            `HEDGE.QUOTE_TOKEN must be provided in the config`
        );
    if (!Object.values(Exchange).includes(config?.HEDGE?.EXCHANGE)) {
        throw new Error(
            `HEDGE.EXCHANGE must be one of ${Object.values(Exchange).join(', ')}`
        );
    }
    return {
        enabled: !!config.HEDGE.ENABLED,
        exchange: config.HEDGE.EXCHANGE,
        quoteToken: config.HEDGE.QUOTE_TOKEN,
    };
}

export function getConfig() {
    const configs = [];
    for (const [market, config] of Object.entries(
        Config as unknown as Record<string, AlgoEngineConfig>
    )) {
        let hedgeParams: HedgeParameters | undefined;
        let executionParams: ExecutionParameters;

        // validate execution params
        if (!config.EXECUTION?.STRATEGY)
            throw new Error(`Execution STRATEGY must be provided in the config`);
        if (config.EXECUTION.STRATEGY === ExecutionType.Spread) {
            if (isNil(config.EXECUTION.MIN_SPREAD))
                throw new Error(`EXECUTION.MIN_SPREAD must be provided in the config for 'spread' strategy`);
            if (!config.EXECUTION.ORDER_NOTIONAL)
                throw new Error(
                    `EXECUTION.ORDER_NOTIONAL must be provided in the config for 'spread' strategy`
                );
            executionParams = {
                strategy: ExecutionType.Spread,
                minSpread: config.EXECUTION.MIN_SPREAD as number,
                orderNotional: config.EXECUTION.ORDER_NOTIONAL,
            };
            hedgeParams = validateHedgeParams(config);
        } else if (config.EXECUTION.STRATEGY === ExecutionType.Twap) {
            if (!config.EXECUTION.PARTS)
                throw new Error(`EXECUTION.PARTS must be provided in the config for 'twap' strategy`);
            if (!config.EXECUTION.PERIOD)
                throw new Error(`EXECUTION.PERIOD must be provided in the config for 'twap' strategy`);
            executionParams = {
                strategy: ExecutionType.Twap,
                parts: Number(config.EXECUTION.PARTS),
                period: config.EXECUTION.PERIOD,
            };
            // validate hedge params if enabled
            if (config.HEDGE && config.HEDGE.ENABLED) {
                hedgeParams = validateHedgeParams(config);
            }
        } else {
            throw new Error(`STRATEGY must be either 'spread' or 'twap'`);
        }

        if (!config.TOTAL_NOTIONAL)
            throw new Error(`TOTAL_NOTIONAL must be provided in the config`);
        if (!config.PERP_DIRECTION)
            throw new Error(`PERP_DIRECTION must be provided in the config`);
        if (![Direction.Long, Direction.Short].includes(config.PERP_DIRECTION)) {
            throw new Error(`PERP_DIRECTION must be either 'long' or 'short'`);
        }

        configs.push({
            baseToken: market,
            hedgeParams,
            executionParams,
            totalNotional: config.TOTAL_NOTIONAL,
            perpDirection: config.PERP_DIRECTION,
            closeOnly: config.CLOSE_ONLY,
            pollInterval: config.POLL_INTERVAL,
            slippage: config.SLIPPAGE,
            acceptableDifference: config.ACCEPTABLE_DIFFERENCE,
        });
    }
    return configs;
};
