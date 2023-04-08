import { expect } from 'chai';
import { Direction, Exchange, Market, OrderType, Side, TimeInForce } from '../common';
import { HttpClient } from '../interface';
import { getHttpClient, getMarket } from '..';
import { describe } from 'mocha';
import { roundUp } from '../../utils/math';
require('dotenv').config();

describe('Binance client', () => {
    let client: HttpClient;
    let markets: Market[];
    before(async () => {
        markets = [
            getMarket(Exchange.Binance, 'ETH', 'USDT'),
            getMarket(Exchange.Binance, 'BTC', 'USDT'),
        ];
        client = await getHttpClient(Exchange.Binance, markets);
    });

    describe('invalid market', () => {
        it('client should fail to instantiate', async () => {
            try {
                const markets = [
                    getMarket(Exchange.Binance, 'ABCDE', 'USDT'),
                    getMarket(Exchange.Binance, 'ETH', 'DAI'),
                ];
                const client = await getHttpClient(Exchange.Binance, markets);
            } catch (err) {
                if (err instanceof Error) {
                    expect(err.message).to.be.eql(
                        'Not all requested binance markets were valid. Invalid: ABCDEUSDT, ETHDAI'
                    );
                }
            }
        });
    });

    describe('place limit order', () => {
        it('should work', async () => {
            const market = markets[0];
            const quote = await client.quote({
                market,
                orderNotional: 500,
                direction: Direction.Long,
            });
            const tickSize = client.marketInfo[market.externalName].tickSize;
            const sizeIncrement = client.marketInfo[market.externalName].sizeIncrement;
            const size = roundUp(11 / quote.averagePrice, sizeIncrement); // binance min notional is $10
            const price = roundUp(quote.averagePrice * 0.95, tickSize);
            const order = await client.placeOrder({
                market: market.externalName,
                price,
                type: OrderType.Limit,
                side: Side.Buy,
                size,
                reduceOnly: false,
                postOnly: true,
            });
            expect(order.market).to.be.eql(market.externalName);
            expect(order.side).to.be.eql(Side.Buy);
            expect(order.price).to.be.eql(price);
            expect(order.type).to.be.eql(OrderType.Limit);
            expect(order.size).to.be.eql(size, 'Size did not match');
            expect(order.reduceOnly).to.be.eql(false);
            expect(order.timeInForce).to.be.eql(TimeInForce.GTC);
            expect(order.postOnly).to.be.eql(true);
        });
        it('should cancel existing orders', async () => {
            const market = markets[0];
            const existingOrders = await client.getOpenOrders(market);
            expect(existingOrders.length).to.be.eql(1);
            await client.cancelAllOrders(market);
            const orders = await client.getOpenOrders(market);
            expect(orders.length).to.be.eql(0);
        });
    });
    describe('place market order', () => {
        let market: Market;
        let size: number;
        before(async () => {
            market = markets[1];
            const quote = await client.quote({
                market,
                orderNotional: 500,
                direction: Direction.Short,
            });
            const sizeIncrement = client.marketInfo[market.externalName].sizeIncrement;
            size = roundUp(11 / quote.averagePrice, sizeIncrement); // binance min notional is $10
        });
        it('should work', async () => {
            const order = await client.placeOrder({
                market: market.externalName,
                price: null,
                type: OrderType.Market,
                side: Side.Sell,
                size,
                reduceOnly: false,
                postOnly: false,
                timeInForce: TimeInForce.IOC,
            });
            expect(order.market).to.be.eql(market.externalName);
            expect(order.side).to.be.eql(Side.Sell);
            expect(order.price).to.be.eql(null);
            expect(order.type).to.be.eql(OrderType.Market);
            expect(order.size).to.be.eql(size);
            expect(order.reduceOnly).to.be.eql(false);
            expect(order.postOnly).to.be.eql(false);
        });
        it('should close the previous market order position', async () => {
            // up to here
            const market = markets[1];
            const order = await client.closePosition(market);
            if (!order) throw new Error('Position doesnt exist even though it should');
            expect(order.market).to.be.eql(market.externalName);
            expect(order.side).to.be.eql(Side.Buy);
            expect(order.price).to.be.eql(null);
            expect(order.type).to.be.eql(OrderType.Market);
            expect(order.size).to.be.eql(size);
            expect(order.reduceOnly).to.be.eql(true);
            expect(order.postOnly).to.be.eql(false);
        });
    });
});
