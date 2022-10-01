import { Position as PerpPosition, PositionSide } from '@perp/sdk-curie';
import { Market, OrderType, Position, Side } from '../connectors/common';
import { HttpClient } from '../connectors/interface';
import { PerpV2Client } from '../connectors/perpetual_protocol_v2';
import { percentage_difference_as_natural } from '../utils/math';
import { Spread } from './execution/spread';
import { Twap } from './execution/twap';
import {
    Direction,
    ExecutionParameters,
    ExecutionType,
    FundingExecution,
    PositionState,
    PositionValidity,
    State,
} from './interface';

export type FundingRateArbitrageParameters = {
    hedgeClient: HttpClient;
    perpClient: PerpV2Client;
    perpMarket: Market;
    hedgeMarket: Market;
    execution: ExecutionParameters;
    totalNotional: number;
    perpDirection: Direction;
    closeOnly: boolean;
    pollInterval?: number; // milliseconds
    slippage?: number; // in bps
};

export default class FundingRateArbitrage {
    private readonly INTERVAL: number = 2000;
    private readonly slippage: number = 100;
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

    constructor(params: FundingRateArbitrageParameters) {
        this.hedgeClient = params.hedgeClient;
        this.perpClient = params.perpClient;
        this.perpMarket = params.perpMarket;
        this.hedgeMarket = params.hedgeMarket;
        this.totalNotional = params.totalNotional;
        this.perpDirection = params.perpDirection;
        this.hedgeDirection = params.perpDirection === Direction.Long ? Direction.Short : Direction.Long;
        if (params.closeOnly) this.closeOnly = true;
        if (params.pollInterval) this.INTERVAL = params.pollInterval;
        if (params.slippage) this.slippage = params.slippage;
        let execution: FundingExecution;
        if (params.execution.strategy === ExecutionType.Spread) {
            execution = new Spread(params.execution, params.perpClient, params.hedgeClient);
        } else {
            execution = new Twap(params.execution, params.totalNotional);
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
        const validity = this.validatePositions(perpPosition, hedgePosition, 100);
        if (validity.positionState !== PositionState.VALID) {
            throw new Error(
                `Position state ${validity.positionState}. Reason: ${validity.message}`
            );
        }
        if (this.closeOnly) {
            this.state = State.CLOSING;
        } else if (
            perpPosition &&
            percentage_difference_as_natural(
                perpPosition.openNotionalOriginal.toNumber(),
                this.totalNotional
            ) > 50
        ) {
            this.state = State.OPENING;
        }
        setInterval(() => this.run(), this.INTERVAL);
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
        hedgePosition: Position | null,
        acceptableDifference: number
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
            const diffInBps = percentage_difference_as_natural(
                perpPosition.sizeAbs.toNumber(),
                hedgePosition.size
            );
            if (diffInBps > acceptableDifference) {
                return {
                    positionState: PositionState.UNBALANCED,
                    message: `Percentage diff in bps is ${diffInBps}`,
                };
            }
        }

        return {
            positionState: PositionState.VALID,
        };
    }

    async run() {
        if (this.running) return;
        this.running = true;

        try {
            const perpPosition = await this.perpClient.getPosition(this.perpMarket);
            const hedgePosition = await this.hedgeClient.getPosition(this.hedgeMarket);
            // 1. validate position
            const validity = this.validatePositions(perpPosition, hedgePosition, 50);
            if (validity.positionState === PositionState.UNBALANCED) {
                const perpPositionSize = perpPosition?.sizeAbs?.toNumber() || 0;
                const hedgePositionSize = hedgePosition?.size || 0;
                const sizeDiff = Math.abs(perpPositionSize - hedgePositionSize);
                switch (this.state) {
                    case State.OPENING: {
                        if (sizeDiff > 0) {
                            // upsize hedge with market order
                            await this.hedgeClient.placeOrder({
                                market: this.hedgeMarket.internalName,
                                side: this.hedgeDirection === Direction.Long ? Side.Buy : Side.Sell,
                                price: null,
                                type: OrderType.Market,
                                size: sizeDiff,
                                reduceOnly: false,
                                ioc: true,
                                postOnly: false,
                            });
                        } else {
                            // upsize perp with market order
                            await this.perpClient.placeOrder({
                                market: this.perpMarket,
                                slippage: 5, // TODO: verify, does this stand for pcnt?
                                side: this.perpDirection === Direction.Long ? Side.Buy : Side.Sell,
                                size: sizeDiff,
                            });
                        }
                    }
                    case State.CLOSING: {
                        if (sizeDiff > 0) {
                            // downsize perp with market order
                            await this.perpClient.placeOrder({
                                market: this.perpMarket,
                                slippage: 5, // TODO: verify, does this stand for pcnt?
                                side: this.perpDirection === Direction.Long ? Side.Buy : Side.Sell,
                                size: sizeDiff,
                            });
                        } else {
                            // downsize hedge with market order
                            await this.hedgeClient.placeOrder({
                                market: this.hedgeMarket.internalName,
                                side: this.hedgeDirection === Direction.Long ? Side.Buy : Side.Sell,
                                price: null,
                                type: OrderType.Market,
                                size: sizeDiff,
                                reduceOnly: true,
                                ioc: true,
                                postOnly: false,
                            });
                        }
                    }
                }
            } else if (validity.positionState === PositionState.WRONG_DIRECTION) {
                // notify user and exit program
                console.log(`Error: WRONG_DIRECTION. ${validity.message}`);
                process.exit(1);
            }

            // 2. check execution condition
            const canExecuteResponse = this.execution.canExecute();
            if (!canExecuteResponse) return;

            // always execute perp first
            const perpTx = await this.perpClient.placeOrder({
                market: this.perpMarket,
                slippage: this.slippage, // TODO: what is this in? bps, pcnt? natural?
                side: this.perpDirection === Direction.Long ? Side.Buy : Side.Sell,
                size: canExecuteResponse.orderSize,
            });
            // TODO: how to check perp Tx was successful, dont want to use subgraph

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
        } catch (err: unknown) {
            console.log(`Failed runner iteration: ${(err as Error).message}`);
        } finally {
            this.running = false;
        }
    }
}
