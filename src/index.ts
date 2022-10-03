import { getHttpClient, getMarket, getPerpV2Client } from './connectors';
import { Exchange } from './connectors/interface';
import PerpV2Helpers from './connectors/perpetual_protocol_v2/helpers';
import {
    Direction,
    ExecutionParameters,
    ExecutionType,
    FundingRateEnvParameters,
} from './strategies/interface';
import FundingRateArbEngine from './strategies/funding_rate';
require('dotenv').config();

const getFundingParameters = (): FundingRateEnvParameters => {
    if (!process.env.STRATEGY) throw new Error(`STRATEGY must be provided in the .env`);
    if (!process.env.HEDGE_EXCHANGE) throw new Error(`HEDGE_EXCHANGE must be provided in the .env`);
    if (!Object.values(Exchange).includes(process.env.HEDGE_EXCHANGE as Exchange)) {
        throw new Error(`HEDGE_EXCHANGE must be one of ${Object.values(Exchange).join(', ')}`);
    }
    if (!process.env.BASE_TOKEN) throw new Error(`BASE_TOKEN must be provided in the .env`);
    if (!process.env.TOTAL_NOTIONAL) throw new Error(`TOTAL_NOTIONAL must be provided in the .env`);
    if (!process.env.PERP_DIRECTION) throw new Error(`PERP_DIRECTION must be provided in the .env`);
    if (![Direction.Long, Direction.Short].includes(process.env.PERP_DIRECTION as Direction)) {
        throw new Error(`PERP_DIRECTION must be either 'long' or 'short'`);
    }
    let executionParams: ExecutionParameters;
    if (process.env.STRATEGY === ExecutionType.Spread) {
        if (!process.env.MAX_SPREAD)
            throw new Error(`MAX_SPREAD must be provided in the .env for 'spread' strategy`);
        if (!process.env.ORDER_NOTIONAL)
            throw new Error(`ORDER_NOTIONAL must be provided in the .env for 'spread' strategy`);
        executionParams = {
            strategy: ExecutionType.Spread,
            maxSpread: Number(process.env.MAX_SPREAD),
            orderNotional: Number(process.env.ORDER_NOTIONAL),
        };
    } else if (process.env.STRATEGY === ExecutionType.Twap) {
        if (!process.env.PARTS)
            throw new Error(`PARTS must be provided in the .env for 'twap' strategy`);
        if (!process.env.PERIOD)
            throw new Error(`PERIOD must be provided in the .env for 'twap' strategy`);
        executionParams = {
            strategy: ExecutionType.Twap,
            parts: Number(process.env.PARTS),
            period: process.env.PERIOD,
        };
    } else {
        throw new Error(`STRATEGY must be either 'spread' or 'twap'`);
    }
    return {
        baseToken: process.env.BASE_TOKEN,
        hedgeExchange: process.env.HEDGE_EXCHANGE as Exchange,
        executionParams,
        totalNotional: Number(process.env.TOTAL_NOTIONAL),
        perpDirection: process.env.PERP_DIRECTION as Direction,
        closeOnly: process.env.CLOSE_ONLY === 'true',
        pollInterval: Number(process.env.POLL_INTERVAL) || undefined,
        slippage: Number(process.env.SLIPPAGE) || undefined,
    };
};

async function main() {
    const fundingParameters = getFundingParameters();
    const perpMarket = PerpV2Helpers.getMarket(fundingParameters.baseToken);
    const hedgeMarket = getMarket(fundingParameters.hedgeExchange, fundingParameters.baseToken);
    const perpClient = await getPerpV2Client([perpMarket]);
    const hedgeClient = await getHttpClient(fundingParameters.hedgeExchange, [hedgeMarket]);
    const fundingRateArbEngine = new FundingRateArbEngine({
        hedgeClient,
        perpClient,
        perpMarket,
        hedgeMarket,
        executionParams: fundingParameters.executionParams,
        totalNotional: fundingParameters.totalNotional,
        perpDirection: fundingParameters.perpDirection,
        closeOnly: fundingParameters.closeOnly,
        pollInterval: fundingParameters.pollInterval,
        slippage: fundingParameters.slippage,
    });
    await fundingRateArbEngine.init();
}

main()
    .then()
    .catch((err) => {
        console.log(`Failed to run funding arb. Error: ${err.message}`);
    });
