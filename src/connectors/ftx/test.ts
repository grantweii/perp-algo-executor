import { expect } from 'chai';
import FtxHelpers from './helpers';
import { Exchange, Market, MarketType, OrderType, Side, TimeInForce } from '../common';
import { HttpClient } from '../interface';
import { getHttpClient } from '..';
import { describe } from 'mocha';
require('dotenv').config();

describe.skip('Ftx client', () => {
    let client: HttpClient;
    let markets: Market[];
    before(async () => {
        const tokens = ['ETH', 'BTC'];
        markets = tokens.map((token) => FtxHelpers.getMarket(token, MarketType.Future));
        client = await getHttpClient(Exchange.Ftx, markets);
    });

    describe('invalid market', () => {
        it('client should fail to instantiate', async () => {
            try {
                const tokens = ['ABCDE'];
                markets = tokens.map((token) => FtxHelpers.getMarket(token, MarketType.Future));
                client = await getHttpClient(Exchange.Ftx, markets);
            } catch (err) {
                if (err instanceof Error) {
                    expect(err.message).to.be.eql('Failed to initialise ftx client. Not all markets are valid')
                }
            }
        })
    })

    describe('place limit order', () => {
        it('should work', async () => {
            const order = await client.placeOrder({
                market: 'ETH-PERP',
                price: 100.1,
                type: OrderType.Limit,
                side: Side.Buy,
                size: 0.002,
                reduceOnly: false,
                postOnly: true,
                timeInForce: TimeInForce.GTC,
            });
            expect(order.market).to.be.eql('ETH-PERP');
            expect(order.side).to.be.eql(Side.Buy);
            expect(order.price).to.be.eql(100.1);
            expect(order.type).to.be.eql(OrderType.Limit);
            expect(order.size).to.be.eql(0.002);
            expect(order.reduceOnly).to.be.eql(false);
            expect(order.timeInForce).to.be.eql(TimeInForce.GTC);
            expect(order.postOnly).to.be.eql(true);
        });
        it('should cancel existing orders', async () => {
            const market = FtxHelpers.getMarket('ETH', MarketType.Future);
            const existingOrders = await client.getOpenOrders(market);
            expect(existingOrders.length).to.be.eql(1);
            await client.cancelAllOrders(market);
            const orders = await client.getOpenOrders(market);
            expect(orders.length).to.be.eql(0);
        });
    });
    describe('place market order', () => {
        it('should work', async () => {
            const order = await client.placeOrder({
                market: 'BTC-PERP',
                price: null,
                type: OrderType.Market,
                side: Side.Sell,
                size: 0.001,
                reduceOnly: false,
                postOnly: false,
                timeInForce: TimeInForce.IOC,
            });
            expect(order.market).to.be.eql('BTC-PERP');
            expect(order.side).to.be.eql(Side.Sell);
            expect(order.price).to.be.eql(null);
            expect(order.type).to.be.eql(OrderType.Market);
            expect(order.size).to.be.eql(0.001);
            expect(order.reduceOnly).to.be.eql(false);
            expect(order.timeInForce).to.be.eql(TimeInForce.IOC);
            expect(order.postOnly).to.be.eql(false);
        });
        it('should close the previous market order position', async () => {
            const market = FtxHelpers.getMarket('BTC', MarketType.Future);
            const order = await client.closePosition(market);
            if (!order) throw new Error('Position doesnt exist even though it should');
            expect(order.market).to.be.eql('BTC-PERP');
            expect(order.side).to.be.eql(Side.Buy);
            expect(order.price).to.be.eql(null);
            expect(order.type).to.be.eql(OrderType.Market);
            expect(order.size).to.be.eql(0.001);
            expect(order.reduceOnly).to.be.eql(false);
            expect(order.postOnly).to.be.eql(false);
        });
    });
});
