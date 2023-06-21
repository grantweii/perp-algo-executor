import { Position as PerpPosition, PositionSide } from '@perp/sdk-curie';
import { Direction, OrderType, Position, Side, TimeInForce } from '../../connectors/common';
import { PositionChangedEvent } from '../../connectors/perpetual_protocol_v2';
import { round } from '../../utils/math';
import { AlgoEngine } from '.';
import { Event, HedgeInfo, PositionState, PositionValidity, State } from '../interface';
import { AlgoEngineParameters } from './interface';

export default class HedgedAlgoEngine extends AlgoEngine {
    private readonly hedge: HedgeInfo;

    constructor(params: AlgoEngineParameters) {
        super(params);
        if (!params.hedge) throw new Error('Hedge is required for Hedged Algo Engine');
        this.hedge = params.hedge;
    }

    /**
     * Validate then initialize state.
     * Create polling interval.
     */
    async init() {
        await this.perp.client.subscribePositionChangedEvent(this.onPositionChangedEvent);
        const perpPosition = await this.perp.client.getPosition(this.perp.market);
        const hedgePosition = await this.hedge.client.getPosition(this.hedge.market);

        // 1. Validate positions
        const validity = this.validatePositions(perpPosition, hedgePosition);
        if (validity.positionState !== PositionState.VALID) {
            throw new Error(
                `Position state ${validity.positionState}. Reason: ${validity.message}`
            );
        }

        // 2. Initialize state
        if (this.closeOnly) {
            this.state = State.CLOSING;
        } else if (perpPosition) {
            if (
                Math.abs(perpPosition.openNotionalOriginal.toNumber()) - this.totalNotional >
                this.acceptableDifference
            ) {
                throw new Error(`Open notional is more than requested total notional`);
            } else {
                this.state = State.OPENING;
            }
        }

        this.runnerInterval = setInterval(() => this.run(), this.INTERVAL);
        console.log(
            `${this.perp.market.baseToken} - Algo execution engine successfully initialized`
        );
    }

    /**
     * Creates one-off event listener for fill.
     * On fill receipt, either places hedge order or noop.
     * If no fill is received after TIMEOUT_INTERVAL ms, one-off event listener is destroyed and returns to regular flow.
     * @param state
     */
    onPerpFill(placeHedge: boolean) {
        // create timeout
        const timeout = setTimeout(() => this.handleTimeout(), this.TIMEOUT_INTERVAL);
        // should only have 1 listener at a time
        if (this.eventEmitter.listenerCount(Event.PerpFill) >= 1) return;

        this.eventEmitter.once(Event.PerpFill, async (args: PositionChangedEvent) => {
            // clear timeout before placing order to avoid race condition
            clearTimeout(timeout);

            if (placeHedge) {
                // -exchangedPositionNotional is LONG, +exchangedPositionNotional is SHORT
                const hedgeDirection = Direction.fromSignedAmount(args.exchangedPositionNotional);
                const size = round(
                    Math.abs(args.exchangedPositionSize),
                    this.hedge.client.marketInfo[this.hedge.market.externalName].sizeIncrement
                );
                console.log(
                    `${this.perp.market.baseToken} - Received perp fill. Executing hedge order. ${hedgeDirection} ${size}...`
                );
                await this.hedge.client.placeOrder({
                    market: this.hedge.market.externalName,
                    side: Side.fromDirection(hedgeDirection),
                    price: null,
                    type: OrderType.Market,
                    size,
                    reduceOnly: this.state === State.CLOSING ? true : false,
                    timeInForce: TimeInForce.IOC,
                    postOnly: false,
                });

                this.execution.onSuccess();
            } else {
                console.log(`${this.perp.market.baseToken} - Received perp fill. Noop...`);
            }

            this.pendingOrder = false;
        });
    }

    async placePerpOrder(orderSize: number, direction: Direction, placeHedge: boolean) {
        try {
            this.onPerpFill(placeHedge);
            this.pendingOrder = true;
            await this.perp.client.placeOrder({
                market: this.perp.market,
                slippage: this.slippage,
                direction,
                size: orderSize,
            });
        } catch (err) {
            this.pendingOrder = false;
            throw err;
        }
    }

    /**
     * Validates the state given current position.
     * Sizes should be within the acceptable difference.
     * @param perpPosition
     * @param hedgePosition
     * @param acceptableDifference
     */
    validatePositions(
        perpPosition: PerpPosition | null,
        hedgePosition: Position | null
    ): PositionValidity {
        // Case 1: One side open
        if (perpPosition && !hedgePosition) {
            return {
                positionState: PositionState.UNBALANCED,
                message: 'Perp position is open but hedge is not',
            };
        }
        if (!perpPosition && hedgePosition) {
            return {
                positionState: PositionState.UNBALANCED,
                message: 'Hedge position is open but perp is not',
            };
        }
        if (perpPosition && hedgePosition) {
            // Case 2: Same direction
            if (perpPosition.side === PositionSide.LONG && hedgePosition.side === Side.Buy) {
                return {
                    positionState: PositionState.WRONG_DIRECTION,
                    message: 'Both perp and hedge are LONG',
                };
            }
            if (perpPosition.side === PositionSide.SHORT && hedgePosition.side === Side.Sell) {
                return {
                    positionState: PositionState.WRONG_DIRECTION,
                    message: 'Both perp and hedge are SHORT',
                };
            }

            if (!this.closeOnly) {
                // Case 3: OPEN/OPENING direction is opposite to position side
                if (
                    (perpPosition.side === PositionSide.LONG &&
                        this.perp.direction === Direction.Short) ||
                    (perpPosition.side === PositionSide.SHORT &&
                        this.perp.direction === Direction.Long)
                ) {
                    return {
                        positionState: PositionState.WRONG_DIRECTION,
                        message: `Perp position is ${perpPosition.side} but expected direction is ${this.perp.direction}`,
                    };
                }
                if (
                    (hedgePosition.side === Side.Buy && this.hedge.direction === Direction.Short) ||
                    (hedgePosition.side === Side.Sell && this.hedge.direction === Direction.Long)
                ) {
                    return {
                        positionState: PositionState.WRONG_DIRECTION,
                        message: `Hedge position is ${hedgePosition.side} but expected direction is ${this.hedge.direction}`,
                    };
                }
            } else {
                // Case 4: CLOSING direction is same as position side
                if (
                    (perpPosition.side === PositionSide.LONG &&
                        this.perp.direction === Direction.Long) ||
                    (perpPosition.side === PositionSide.SHORT &&
                        this.perp.direction === Direction.Short)
                ) {
                    return {
                        positionState: PositionState.WRONG_DIRECTION,
                        message: `Perp position is ${perpPosition.side} and direction is also ${this.perp.direction}. Closing direction should be opposite`,
                    };
                }
                if (
                    (hedgePosition.side === Side.Buy && this.hedge.direction === Direction.Long) ||
                    (hedgePosition.side === Side.Sell && this.hedge.direction === Direction.Short)
                ) {
                    return {
                        positionState: PositionState.WRONG_DIRECTION,
                        message: `Hedge position is ${hedgePosition.side} and direction is ${this.hedge.direction}. Closing direction should be opposite`,
                    };
                }
            }

            // Case 5: correct directions but unbalanced
            const perpNotional = perpPosition.sizeAbs.mul(hedgePosition.entryPrice).toNumber();
            const hedgeNotional = hedgePosition.entryPrice * hedgePosition.size;
            const notionalDiff = Math.abs(perpNotional - hedgeNotional);
            const hedgeMarketInfo = this.hedge.client.marketInfo[this.hedge.market.externalName];
            const midPrice = (hedgeMarketInfo.lastAsk + hedgeMarketInfo.lastBid) / 2;
            const approximateSize = notionalDiff / midPrice;
            // size diff must be > hedge market min size and acceptable difference specified in config
            if (
                notionalDiff > this.acceptableDifference &&
                approximateSize > hedgeMarketInfo.minSize
            ) {
                return {
                    positionState: PositionState.UNBALANCED,
                    message: `Perp size: ${perpPosition.sizeAbs.toNumber()}. Hedge size: ${
                        hedgePosition.size
                    }`,
                };
            }
        }

        return {
            positionState: PositionState.VALID,
        };
    }

    /**
     * Runner for OPENING state.
     * @param perpPosition
     * @param hedgePosition
     * @returns
     */
    private async pollOpening(perpPosition: PerpPosition | null, hedgePosition: Position | null) {
        // 1. check if position is complete
        if (perpPosition && hedgePosition) {
            const perpEntryNotional = Math.abs(perpPosition.openNotionalOriginal.toNumber());
            const hedgeEntryNotional = hedgePosition.entryPrice * hedgePosition.size;
            const perpNotionalDiff = perpEntryNotional - this.totalNotional;
            const hedgeNotionalDiff = hedgeEntryNotional - this.totalNotional;
            // difference of $X notional is acceptable to finish on
            if (
                Math.abs(perpNotionalDiff) < this.acceptableDifference &&
                Math.abs(hedgeNotionalDiff) < this.acceptableDifference
            ) {
                console.log(
                    `${this.perp.market.baseToken} - ${this.state} algo execution complete. Perp notional: ${perpEntryNotional}. Hedge notional: ${hedgeEntryNotional}`
                );
                clearInterval(this.runnerInterval);
                return;
            }

            let skipIteration = false;
            // downsize to total notional if we have opened too much
            if (perpNotionalDiff > this.acceptableDifference) {
                // use hedge price to calculate approximate size as it will be more stable
                const hedgePrice = await this.hedge.client.quote({
                    market: this.hedge.market,
                    orderNotional: perpNotionalDiff,
                    direction: this.hedge.direction, // we are downsizing so use the opposite direction
                });
                const sizeToDownsize = perpNotionalDiff / hedgePrice.averagePrice;
                console.log(
                    `${this.perp.market.baseToken} - Downsizing perp ${this.hedge.direction} ${sizeToDownsize}`
                );
                await this.placePerpOrder(sizeToDownsize, this.hedge.direction, false); // we are downsizing so use the opposite direction
                skipIteration = true;
            }
            if (hedgeNotionalDiff > this.acceptableDifference) {
                // use hedge price to calculate approximate size as it will be more stable
                const hedgePrice = await this.hedge.client.quote({
                    market: this.hedge.market,
                    orderNotional: hedgeNotionalDiff,
                    direction: this.perp.direction, // we are downsizing so use the opposite direction
                });
                const sizeToDownsize = hedgeNotionalDiff / hedgePrice.averagePrice;
                const size = round(
                    sizeToDownsize,
                    this.hedge.client.marketInfo[this.hedge.market.externalName].sizeIncrement
                );
                console.log(
                    `${this.perp.market.baseToken} - Downsizing hedge: ${this.perp.direction} ${size}`
                );
                await this.hedge.client.placeOrder({
                    market: this.hedge.market.externalName,
                    side: Side.fromOppositeDirection(this.hedge.direction), // we are downsizing so use the opposite direction
                    price: null,
                    type: OrderType.Market,
                    size,
                    reduceOnly: true,
                    timeInForce: TimeInForce.IOC,
                    postOnly: false,
                });
                skipIteration = true;
            }
            if (skipIteration) return;
        }

        // 2. validate position
        const validity = this.validatePositions(perpPosition, hedgePosition);
        if (validity.positionState === PositionState.UNBALANCED) {
            console.log(
                `${this.perp.market.baseToken} - Position state: UNBALANCED. Message: ${validity.message}`
            );
            const perpPositionSize = perpPosition?.sizeAbs?.toNumber() || 0;
            const hedgePositionSize = hedgePosition?.size || 0;
            const sizeDiff = perpPositionSize - hedgePositionSize;
            const absSizeDiff = Math.abs(sizeDiff);
            if (sizeDiff > 0) {
                // upsize hedge with market order
                const size = round(
                    absSizeDiff,
                    this.hedge.client.marketInfo[this.hedge.market.externalName].sizeIncrement
                );
                console.log(
                    `${this.perp.market.baseToken} - Upsizing hedge: ${this.hedge.direction} ${size}`
                );
                await this.hedge.client.placeOrder({
                    market: this.hedge.market.externalName,
                    side: Side.fromDirection(this.hedge.direction),
                    price: null,
                    type: OrderType.Market,
                    size,
                    reduceOnly: false,
                    timeInForce: TimeInForce.IOC,
                    postOnly: false,
                });
            } else {
                // upsize perp with market order
                console.log(
                    `${this.perp.market.baseToken} - Upsizing perp: ${this.perp.direction} ${absSizeDiff}`
                );
                await this.placePerpOrder(absSizeDiff, this.perp.direction, false);
            }
        } else if (validity.positionState === PositionState.WRONG_DIRECTION) {
            // notify user and kill polling interval
            console.log(
                `${this.perp.market.baseToken} - Error: WRONG_DIRECTION. ${validity.message}`
            );
            clearInterval(this.runnerInterval);
            return;
        } else {
            // valid position state
            // 3. check execution condition
            const canExecuteResponse = await this.execution.canExecute();
            console.log(
                `${this.perp.market.baseToken} - Execution condition met: ${!!canExecuteResponse}`
            );
            if (!canExecuteResponse) return;

            let orderSize = canExecuteResponse.orderSize;
            const perpEntryNotional = Math.abs(perpPosition?.openNotionalOriginal.toNumber() || 0);
            // recalc order size if remaining notional is less than order notional
            if (this.totalNotional - perpEntryNotional < this.execution.orderNotional) {
                orderSize = (this.totalNotional - perpEntryNotional) / canExecuteResponse.price;
            }

            console.log(
                `${this.perp.market.baseToken} - Executing perp order. ${this.perp.direction} ${orderSize}...`
            );
            await this.placePerpOrder(orderSize, this.perp.direction, true);
        }
    }

    /**
     * Runner for CLOSING state.
     * @param perpPosition
     * @param hedgePosition
     * @returns
     */
    private async pollClosing(perpPosition: PerpPosition | null, hedgePosition: Position | null) {
        // 1. check if position is complete
        if (!perpPosition && !hedgePosition) {
            console.log(`${this.perp.market.baseToken} - ${this.state} algo execution complete`);
            clearInterval(this.runnerInterval);
            return;
        }

        // 2. validate position
        const validity = this.validatePositions(perpPosition, hedgePosition);
        if (validity.positionState === PositionState.UNBALANCED) {
            console.log(
                `${this.perp.market.baseToken} - Position state: UNBALANCED. Message: ${validity.message}`
            );
            const perpPositionSize = perpPosition?.sizeAbs?.toNumber() || 0;
            const hedgePositionSize = hedgePosition?.size || 0;
            const sizeDiff = perpPositionSize - hedgePositionSize;
            const absSizeDiff = Math.abs(sizeDiff);
            if (sizeDiff > 0) {
                // downsize perp with market order
                console.log(
                    `${this.perp.market.baseToken} - Downsizing perp. ${this.perp.direction} ${absSizeDiff}`
                );
                await this.placePerpOrder(absSizeDiff, this.perp.direction, false);
            } else {
                // downsize hedge with market order
                const size = round(
                    absSizeDiff,
                    this.hedge.client.marketInfo[this.hedge.market.externalName].sizeIncrement
                );
                console.log(
                    `${this.perp.market.baseToken} - Downsizing hedge. ${this.hedge.direction} ${size}`
                );
                await this.hedge.client.placeOrder({
                    market: this.hedge.market.externalName,
                    side: Side.fromDirection(this.hedge.direction),
                    price: null,
                    type: OrderType.Market,
                    size,
                    reduceOnly: true,
                    timeInForce: TimeInForce.IOC,
                    postOnly: false,
                });
            }
        } else if (validity.positionState === PositionState.WRONG_DIRECTION) {
            // notify user and kill polling interval
            console.log(
                `${this.perp.market.baseToken} - Error: WRONG_DIRECTION. ${validity.message}`
            );
            clearInterval(this.runnerInterval);
            return;
        } else {
            // valid position state
            // 3. check execution condition
            const canExecuteResponse = await this.execution.canExecute();
            console.log(
                `${this.perp.market.baseToken} - Execution condition met: ${!!canExecuteResponse}`
            );
            if (!canExecuteResponse) return;

            if ((perpPosition?.sizeAbs?.toNumber() || 0) < canExecuteResponse.orderSize) {
                // Call explicit close position when we get to the final leg to avoid dust positions
                console.log(`${this.perp.market.baseToken} - Closing remaining perp position...`);
                await this.perp.client.closePosition(this.perp.market);
                console.log(`${this.perp.market.baseToken} - Closing remaining hedge position...`);
                await this.hedge.client.closePosition(this.hedge.market);
                return;
            }

            console.log(
                `${this.perp.market.baseToken} - Executing perp order. ${this.perp.direction} ${canExecuteResponse.orderSize}...`
            );
            await this.placePerpOrder(canExecuteResponse.orderSize, this.perp.direction, true);
        }
    }

    async run() {
        if (this.running || this.pendingOrder) return;
        this.running = true;

        try {
            const perpPosition = await this.perp.client.getPosition(this.perp.market);
            const hedgePosition = await this.hedge.client.getPosition(this.hedge.market);
            console.log(
                `${this.perp.market.baseToken} - Perp position: ${
                    perpPosition?.sizeAbs || 0
                }. Hedge position: ${hedgePosition?.size || 0}`
            );

            if (this.state === State.OPENING) {
                await this.pollOpening(perpPosition, hedgePosition);
            } else {
                await this.pollClosing(perpPosition, hedgePosition);
            }
        } catch (err: unknown) {
            console.log(
                `${this.perp.market.baseToken} - Failed runner iteration: ${(err as Error).message}`
            );
        } finally {
            this.running = false;
        }
    }
}
