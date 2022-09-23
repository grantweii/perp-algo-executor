import { getHttpClient } from './connectors';
import { Market, MarketType, OrderType, Side } from './connectors/common';
import FtxHelpers from './connectors/ftx/helpers';
import { Exchange } from './connectors/interface';
export * from './connectors';
require('dotenv').config();

async function main() {
    const tokens: string[] = ['ETH', 'BTC'];
    const markets = tokens.map((token) => FtxHelpers.getMarket(MarketType.Future, token));
    const client = await getHttpClient(Exchange.Ftx, markets);
    // const res = await client.placeOrder({
    //     market: 'ETH-PERP',
    //     side: Side.Buy,
    //     type: OrderType.Market,
    //     size: 0.001,
    //     reduceOnly: false,
    //     ioc: false,
    //     postOnly: false,
    //     price: null,
    // });
    // console.log(res);
}

main()
    .then()
    .catch((err) => {
        console.log(`Failed to run funding arb. Error: ${err.message}`);
    });
