import { Position as PerpPosition, PositionSide } from '@perp/sdk-curie';
import { Market, OrderType, Position, Side } from '../connectors/common';
import { HttpClient } from '../connectors/interface';
import { PerpV2Client } from '../connectors/perpetual_protocol_v2';
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
    }

    /**
     * Validate then initialize state.
     * Create polling interval.
     */
    async init() {
        const perpPosition = await this.perpClient.getPosition(this.perpMarket);
        const hedgePosition = await this.hedgeClient.getPosition(this.hedgeMarket);
        const validity = this.validatePositions(perpPosition, hedgePosition);
        if (validity.positionState !== PositionState.VALID) {
            throw new Error(
                `Position state ${validity.positionState}. Reason: ${validity.message}`
            );
        }
        if (this.closeOnly) {
            this.state = State.CLOSING;
        } else if (
            perpPosition &&
            Math.abs(perpPosition.openNotionalOriginal.toNumber() - this.totalNotional) >
                this.acceptableDifference
        ) {
            this.state = State.OPENING;
        }
        this.runnerInterval = setInterval(() => this.run(), this.INTERVAL);
        console.log(`${this.perpMarket.baseToken} - Funding rate arb successfully initialized`);
    }

    /**
     * Validates the state given current position.
     * Sizes should be within the acceptable difference.
     * @param perpPosition
     * @param hedgePosition
     * @param acceptableDifference in bps
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
            const perpNotional = perpPosition.entryPrice.mul(perpPosition.sizeAbs).toNumber();
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
            const perpEntryNotional = perpPosition.entryPrice.mul(perpPosition.sizeAbs).toNumber();
            const hedgeEntryNotional = hedgePosition.entryPrice * hedgePosition.size;
            // difference of $X notional is acceptable to finish on
            if (
                (perpEntryNotional > this.totalNotional &&
                    hedgeEntryNotional > this.totalNotional) ||
                (Math.abs(perpEntryNotional - this.totalNotional) < this.acceptableDifference &&
                    Math.abs(hedgeEntryNotional - this.totalNotional) < this.acceptableDifference)
            ) {
                console.log(
                    `${this.perpMarket.baseToken} - ${this.state} funding rate arb complete. Perp notional: ${perpEntryNotional}. Hedge notional: ${hedgeEntryNotional}`
                );
                clearInterval(this.runnerInterval);
                return;
            }
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
                await this.perpClient.placeOrder({
                    market: this.perpMarket,
                    slippage: this.slippage,
                    direction: this.perpDirection,
                    size: absSizeDiff,
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

            let orderSize = canExecuteResponse.orderSize;
            const perpEntryNotional =
                perpPosition?.entryPrice.mul(perpPosition.sizeAbs).toNumber() || 0;
            // recalc order size if remaining notional is less than order notional
            if (this.totalNotional - perpEntryNotional < this.execution.orderNotional) {
                orderSize = (this.totalNotional - perpEntryNotional) / canExecuteResponse.price;
            }

            console.log(
                `${this.perpMarket.baseToken} - Executing perp order. ${this.perpDirection} ${canExecuteResponse.orderSize}...`
            );
            // always execute perp first
            await this.perpClient.placeOrder({
                market: this.perpMarket,
                slippage: this.slippage,
                direction: this.perpDirection,
                size: orderSize,
            });
            console.log(
                `${this.perpMarket.baseToken} - Executing hedge order. ${this.hedgeDirection} ${canExecuteResponse.orderSize}...`
            );
            await this.hedgeClient.placeOrder({
                market: this.hedgeMarket.internalName,
                side: this.hedgeDirection === Direction.Long ? Side.Buy : Side.Sell,
                price: null,
                type: OrderType.Market,
                size: canExecuteResponse.orderSize,
                reduceOnly: false,
                ioc: true,
                postOnly: false,
            });
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
                await this.perpClient.placeOrder({
                    market: this.perpMarket,
                    slippage: this.slippage,
                    direction: this.perpDirection,
                    size: absSizeDiff,
                });
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
            // always execute perp first
            await this.perpClient.placeOrder({
                market: this.perpMarket,
                slippage: this.slippage,
                direction: this.perpDirection,
                size: canExecuteResponse.orderSize,
            });
            console.log(
                `${this.perpMarket.baseToken} - Executing hedge order. ${this.hedgeDirection} ${canExecuteResponse.orderSize}...`
            );
            await this.hedgeClient.placeOrder({
                market: this.hedgeMarket.internalName,
                side: this.hedgeDirection === Direction.Long ? Side.Buy : Side.Sell,
                price: null,
                type: OrderType.Market,
                size: canExecuteResponse.orderSize,
                reduceOnly: false,
                ioc: true,
                postOnly: false,
            });
        }
    }

    private async run() {
        if (this.running) return;
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
