import { Position as PerpPosition, PositionSide } from '@perp/sdk-curie';
import EventEmitter from 'events';
import { Market, OrderType, Position, Side } from '../connectors/common';
import { HttpClient } from '../connectors/interface';
import { PerpV2Client, PositionChangedEvent } from '../connectors/perpetual_protocol_v2';
import { bpsToNatural } from '../utils/math';
import { Spread } from './execution/spread';
import { Twap } from './execution/twap';
import {
    Direction,
    ExecutionType,
    FundingExecution,
    FundingRateEngineParameters,
    PositionState,
    PositionValidity,
    State,
} from './interface';

export default class FundingRateArbEngine {
    /**
     * Poll interval.
     */
    private readonly INTERVAL: number = 2000;
    /**
     * Timeout interval.
     */
    private readonly TIMEOUT_INTERVAL: number = 30000;
    /**
     * Max slippage on perp.
     */
    private readonly slippage: number = 100;
    /**
     * Upper bound for difference in notional value.
     * ie. If perp notional is $100, hedge notional must be no more than $105, or less than $95 etc.
     */
    private readonly acceptableDifference: number = 5;
    private readonly hedgeClient: HttpClient;
    private readonly perpClient: PerpV2Client;
    private readonly perpMarket: Market;
    private readonly hedgeMarket: Market;
    private readonly totalNotional: number;
    private readonly execution: FundingExecution;
    private readonly perpDirection: Direction;
    private readonly hedgeDirection: Direction;
    private readonly closeOnly: boolean = false;

    private state: State = State.OPENING;
    private running: boolean = false;
    private runnerInterval?: NodeJS.Timer;
    private pendingOrder: boolean = false;
    private eventEmitter: EventEmitter;

    constructor(params: FundingRateEngineParameters) {
        this.hedgeClient = params.hedgeClient;
        this.perpClient = params.perpClient;
        this.perpMarket = params.perpMarket;
        this.hedgeMarket = params.hedgeMarket;
        this.totalNotional = params.totalNotional;
        this.perpDirection = params.perpDirection;
        const hedgeDirection =
            params.perpDirection === Direction.Long ? Direction.Short : Direction.Long;
        this.hedgeDirection = hedgeDirection;
        if (params.closeOnly) this.closeOnly = true;
        if (params.pollInterval) this.INTERVAL = params.pollInterval;
        if (params.slippage) this.slippage = params.slippage;
        if (params.acceptableDifference)
            this.acceptableDifference =
                bpsToNatural(params.acceptableDifference) * params.totalNotional;
        let execution: FundingExecution;
        if (params.executionParams.strategy === ExecutionType.Spread) {
            execution = new Spread({
                spread: params.executionParams,
                perpClient: params.perpClient,
                hedgeClient: params.hedgeClient,
                perpDirection: params.perpDirection,
                hedgeDirection: hedgeDirection,
                perpMarket: params.perpMarket,
                hedgeMarket: params.hedgeMarket,
            });
        } else {
            execution = new Twap({
                twap: params.executionParams,
                perpClient: params.perpClient,
                perpMarket: params.perpMarket,
                totalNotional: params.totalNotional,
                perpDirection: params.perpDirection,
            });
        }
        this.execution = execution;
        this.onPositionChangedEvent = this.onPositionChangedEvent.bind(this);
        this.eventEmitter = new EventEmitter();
    }

    /**
     * Validate then initialize state.
     * Create polling interval.
     */
    async init() {
        await this.perpClient.subscribePositionChangedEvent(this.onPositionChangedEvent);
        const perpPosition = await this.perpClient.getPosition(this.perpMarket);
        const hedgePosition = await this.hedgeClient.getPosition(this.hedgeMarket);

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
            // TODO: call updateOrderNotional if we decide to account for existing position
        } else if (perpPosition) {
            if (
                Math.abs(perpPosition.openNotionalOriginal.toNumber()) - this.totalNotional >
                this.acceptableDifference
            ) {
                throw new Error(`Open notional is more than requested total notional`);
            } else {
                this.state = State.OPENING;
                // // Account for existing position (if any) in TWAP order notional value
                // if (perpPosition && !perpPosition.openNotionalAbs.eq(0) && this.execution instanceof Twap) {
                //     const updatedOrderNotional = this.execution.updateOrderNotional(perpPosition.openNotionalAbs.toNumber());
                //     console.log(`${this.perpMarket.baseToken} - TWAP. Updated order notional to ${updatedOrderNotional}`);
                // }
            }
        }

        this.runnerInterval = setInterval(() => this.run(), this.INTERVAL);
        console.log(`${this.perpMarket.baseToken} - Funding rate arb successfully initialized`);
    }

    /**
     * Handler called when a perp PositionChanged event is received.
     * Checks if event matches user's wallet and subscribed token and places corresponding hedge order.
     * @param params
     */
    async onPositionChangedEvent(params: PositionChangedEvent) {
        if (
            params.trader === this.perpClient.wallet.address &&
            params.baseToken === this.perpClient.baseTokenAddress(this.perpMarket)
        ) {
            this.eventEmitter.emit('perp_fill', params);
        }
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
        this.eventEmitter.once('perp_fill', async (args: PositionChangedEvent) => {
            // clear timeout before placing order to avoid race condition
            clearTimeout(timeout);

            if (placeHedge) {
                // -exchangedPositionNotional is LONG, +exchangedPositionNotional is SHORT
                const hedgeDirection =
                    args.exchangedPositionNotional < 0 ? Direction.Short : Direction.Long;
                console.log(
                    `${this.perpMarket.baseToken} - Received perp fill. Executing hedge order. ${hedgeDirection} ${args.exchangedPositionSize}...`
                );
                await this.hedgeClient.placeOrder({
                    market: this.hedgeMarket.internalName,
                    side: hedgeDirection === Direction.Long ? Side.Buy : Side.Sell,
                    price: null,
                    type: OrderType.Market,
                    size: Math.abs(args.exchangedPositionSize),
                    reduceOnly: this.state === State.CLOSING ? true : false,
                    ioc: true,
                    postOnly: false,
                });
            } else {
                console.log(`${this.perpMarket.baseToken} - Received perp fill. Noop...`);
            }

            this.pendingOrder = false;
        });
    }

    /**
     * On timeout, destroys one-off event listener and returns to regular flow.
     */
    handleTimeout() {
        if (this.pendingOrder) {
            console.log(
                `${this.perpMarket.baseToken} - Pending order timed out after ${
                    this.TIMEOUT_INTERVAL / 1000
                } secs...`
            );
            this.pendingOrder = false;
        }
    }

    async placePerpOrder(orderSize: number, direction: Direction, placeHedge: boolean) {
        try {
            this.onPerpFill(placeHedge);
            this.pendingOrder = true;
            await this.perpClient.placeOrder({
                market: this.perpMarket,
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
                        this.perpDirection === Direction.Short) ||
                    (perpPosition.side === PositionSide.SHORT &&
                        this.perpDirection === Direction.Long)
                ) {
                    return {
                        positionState: PositionState.WRONG_DIRECTION,
                        message: `Perp position is ${perpPosition.side} but expected direction is ${this.perpDirection}`,
                    };
                }
                const hedgeDirection =
                    this.perpDirection === Direction.Long ? Direction.Short : Direction.Long;
                if (
                    (hedgePosition.side === Side.Buy && hedgeDirection === Direction.Short) ||
                    (hedgePosition.side === Side.Sell && hedgeDirection === Direction.Long)
                ) {
                    return {
                        positionState: PositionState.WRONG_DIRECTION,
                        message: `Hedge position is ${hedgePosition.side} but expected direction is ${hedgeDirection}`,
                    };
                }
            } else {
                // Case 4: CLOSING direction is same as position side
                if (
                    (perpPosition.side === PositionSide.LONG &&
                        this.perpDirection === Direction.Long) ||
                    (perpPosition.side === PositionSide.SHORT &&
                        this.perpDirection === Direction.Short)
                ) {
                    return {
                        positionState: PositionState.WRONG_DIRECTION,
                        message: `Perp position is ${perpPosition.side} and direction is also ${this.perpDirection}. Closing direction should be opposite`,
                    };
                }
                const hedgeDirection =
                    this.perpDirection === Direction.Long ? Direction.Short : Direction.Long;
                if (
                    (hedgePosition.side === Side.Buy && hedgeDirection === Direction.Long) ||
                    (hedgePosition.side === Side.Sell && hedgeDirection === Direction.Short)
                ) {
                    return {
                        positionState: PositionState.WRONG_DIRECTION,
                        message: `Hedge position is ${hedgePosition.side} and direction is ${hedgeDirection}. Closing direction should be opposite`,
                    };
                }
            }

            // Case 5: correct directions but unbalanced
            const perpNotional = perpPosition.sizeAbs.mul(hedgePosition.entryPrice).toNumber();
            const hedgeNotional = hedgePosition.entryPrice * hedgePosition.size;
            const notionalDiff = Math.abs(perpNotional - hedgeNotional);
            if (notionalDiff > this.acceptableDifference) {
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
                    `${this.perpMarket.baseToken} - ${this.state} funding rate arb complete. Perp notional: ${perpEntryNotional}. Hedge notional: ${hedgeEntryNotional}`
                );
                clearInterval(this.runnerInterval);
                return;
            }

            let skipIteration = false;
            // downsize to total notional if we have opened too much
            if (perpNotionalDiff > this.acceptableDifference) {
                // use hedge price to calculate approximate size as it will be more stable
                const hedgePrice = await this.hedgeClient.quote({
                    market: this.hedgeMarket,
                    orderNotional: perpNotionalDiff,
                    direction: this.hedgeDirection, // we are downsizing so use the opposite direction
                });
                const sizeToDownsize = perpNotionalDiff / hedgePrice.averagePrice;
                await this.placePerpOrder(sizeToDownsize, this.hedgeDirection, false); // we are downsizing so use the opposite direction
                skipIteration = true;
            }
            if (hedgeNotionalDiff > this.acceptableDifference) {
                // use hedge price to calculate approximate size as it will be more stable
                const hedgePrice = await this.hedgeClient.quote({
                    market: this.hedgeMarket,
                    orderNotional: hedgeNotionalDiff,
                    direction: this.perpDirection, // we are downsizing so use the opposite direction
                });
                const sizeToDownsize = hedgeNotionalDiff / hedgePrice.averagePrice;
                await this.hedgeClient.placeOrder({
                    market: this.hedgeMarket.internalName,
                    side: this.hedgeDirection === Direction.Long ? Side.Sell : Side.Buy, // we are downsizing so use the opposite direction
                    price: null,
                    type: OrderType.Market,
                    size: sizeToDownsize,
                    reduceOnly: true,
                    ioc: true,
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
                `${this.perpMarket.baseToken} - Position state: UNBALANCED. Message: ${validity.message}`
            );
            const perpPositionSize = perpPosition?.sizeAbs?.toNumber() || 0;
            const hedgePositionSize = hedgePosition?.size || 0;
            const sizeDiff = perpPositionSize - hedgePositionSize;
            const absSizeDiff = Math.abs(sizeDiff);
            if (sizeDiff > 0) {
                // upsize hedge with market order
                console.log(
                    `${this.perpMarket.baseToken} - Upsizing hedge: ${this.hedgeDirection} ${absSizeDiff}`
                );
                await this.hedgeClient.placeOrder({
                    market: this.hedgeMarket.internalName,
                    side: this.hedgeDirection === Direction.Long ? Side.Buy : Side.Sell,
                    price: null,
                    type: OrderType.Market,
                    size: absSizeDiff,
                    reduceOnly: false,
                    ioc: true,
                    postOnly: false,
                });
            } else {
                // upsize perp with market order
                console.log(
                    `${this.perpMarket.baseToken} - Upsizing perp: ${this.perpDirection} ${absSizeDiff}`
                );
                await this.placePerpOrder(absSizeDiff, this.perpDirection, false);
            }
        } else if (validity.positionState === PositionState.WRONG_DIRECTION) {
            // notify user and kill polling interval
            console.log(
                `${this.perpMarket.baseToken} - Error: WRONG_DIRECTION. ${validity.message}`
            );
            clearInterval(this.runnerInterval);
            return;
        } else {
            // valid position state
            // 3. check execution condition
            const canExecuteResponse = await this.execution.canExecute();
            console.log(
                `${this.perpMarket.baseToken} - Execution condition met: ${!!canExecuteResponse}`
            );
            if (!canExecuteResponse) return;

            let orderSize = canExecuteResponse.orderSize;
            const perpEntryNotional = Math.abs(perpPosition?.openNotionalOriginal.toNumber() || 0);
            // recalc order size if remaining notional is less than order notional
            if (this.totalNotional - perpEntryNotional < this.execution.orderNotional) {
                orderSize = (this.totalNotional - perpEntryNotional) / canExecuteResponse.price;
            }

            console.log(
                `${this.perpMarket.baseToken} - Executing perp order. ${this.perpDirection} ${orderSize}...`
            );
            await this.placePerpOrder(orderSize, this.perpDirection, true);
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
            console.log(`${this.perpMarket.baseToken} - ${this.state} funding rate arb complete`);
            clearInterval(this.runnerInterval);
            return;
        }

        // 2. validate position
        const validity = this.validatePositions(perpPosition, hedgePosition);
        if (validity.positionState === PositionState.UNBALANCED) {
            console.log(
                `${this.perpMarket.baseToken} - Position state: UNBALANCED. Message: ${validity.message}`
            );
            const perpPositionSize = perpPosition?.sizeAbs?.toNumber() || 0;
            const hedgePositionSize = hedgePosition?.size || 0;
            const sizeDiff = perpPositionSize - hedgePositionSize;
            const absSizeDiff = Math.abs(sizeDiff);
            if (sizeDiff > 0) {
                // downsize perp with market order
                console.log(
                    `${this.perpMarket.baseToken} - Downsizing perp. ${this.perpDirection} ${absSizeDiff}`
                );
                await this.placePerpOrder(absSizeDiff, this.perpDirection, false);
            } else {
                // downsize hedge with market order
                console.log(
                    `${this.perpMarket.baseToken} - Downsizing hedge. ${this.hedgeDirection} ${absSizeDiff}`
                );
                await this.hedgeClient.placeOrder({
                    market: this.hedgeMarket.internalName,
                    side: this.hedgeDirection === Direction.Long ? Side.Buy : Side.Sell,
                    price: null,
                    type: OrderType.Market,
                    size: absSizeDiff,
                    reduceOnly: true,
                    ioc: true,
                    postOnly: false,
                });
            }
        } else if (validity.positionState === PositionState.WRONG_DIRECTION) {
            // notify user and kill polling interval
            console.log(
                `${this.perpMarket.baseToken} - Error: WRONG_DIRECTION. ${validity.message}`
            );
            clearInterval(this.runnerInterval);
            return;
        } else {
            // valid position state
            // 3. check execution condition
            const canExecuteResponse = await this.execution.canExecute();
            console.log(
                `${this.perpMarket.baseToken} - Execution condition met: ${!!canExecuteResponse}`
            );
            if (!canExecuteResponse) return;

            if ((perpPosition?.sizeAbs?.toNumber() || 0) < canExecuteResponse.orderSize) {
                // Call explicit close position when we get to the final leg to avoid dust positions
                console.log(`${this.perpMarket.baseToken} - Closing remaining position...`);
                await this.perpClient.closePosition(this.perpMarket);
                await this.hedgeClient.closePosition(this.hedgeMarket);
                return;
            }

            console.log(
                `${this.perpMarket.baseToken} - Executing perp order. ${this.perpDirection} ${canExecuteResponse.orderSize}...`
            );
            await this.placePerpOrder(canExecuteResponse.orderSize, this.perpDirection, true);
        }
    }

    private async run() {
        if (this.running || this.pendingOrder) return;
        this.running = true;

        try {
            const perpPosition = await this.perpClient.getPosition(this.perpMarket);
            const hedgePosition = await this.hedgeClient.getPosition(this.hedgeMarket);
            console.log(
                `${this.perpMarket.baseToken} - Perp position: ${
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
                `${this.perpMarket.baseToken} - Failed runner iteration: ${(err as Error).message}`
            );
        } finally {
            this.running = false;
        }
    }
}
