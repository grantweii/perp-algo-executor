import { Position as PerpPosition, PositionSide } from '@perp/sdk-curie';
import { Market, Position, Side } from '../connectors/common';
import { HttpClient } from '../connectors/interface';
import { PerpV2Client } from '../connectors/perpetual_protocol_v2';
import { percentage_difference_as_natural } from '../utils/math';

enum State {
    OPENING = 'OPENING',
    CLOSING = 'CLOSING',
}

enum ExecutionType {
    Spread = 'spread',
    Twap = 'twap',
}

enum Direction {
    Long = 'long',
    Short = 'short',
}

enum PositionState {
    VALID = 'VALID',
    WRONG_DIRECTION = 'WRONG_DIRECTION',
    UNBALANCED = 'UNBALANCED',
}

type SpreadParameters = {
    strategy: ExecutionType.Spread;
    maxSpread: number;
    orderNotional: number;
};

type TwapParameters = {
    strategy: ExecutionType.Twap;
    parts: number;
    period: string;
};

type ExecutionParameters = SpreadParameters | TwapParameters;

type ValidPosition = {
    positionState: PositionState.VALID;
};

type InvalidPosition = {
    positionState: PositionState.UNBALANCED | PositionState.WRONG_DIRECTION;
    message: string;
};

type PositionValidity = ValidPosition | InvalidPosition;

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
};

export default class FundingRateArbitrage {
    private readonly INTERVAL: number = 2000;
    private readonly hedgeClient: HttpClient;
    private readonly perpClient: PerpV2Client;
    private readonly perpMarket: Market;
    private readonly hedgeMarket: Market;
    private readonly totalNotional: number;
    private readonly execution: ExecutionParameters;
    private readonly perpDirection: Direction;
    private readonly closeOnly: boolean = false;

    private state: State = State.OPENING;
    private running: boolean = false;

    constructor(params: FundingRateArbitrageParameters) {
        this.hedgeClient = params.hedgeClient;
        this.perpClient = params.perpClient;
        this.perpMarket = params.perpMarket;
        this.hedgeMarket = params.hedgeMarket;
        this.totalNotional = params.totalNotional;
        this.execution = params.execution;
        this.perpDirection = params.perpDirection;
        if (params.closeOnly) this.closeOnly = true;
        if (params.pollInterval) this.INTERVAL = params.pollInterval;
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
            throw new Error(`Position state ${validity.positionState}. Reason: ${validity.message}`);
        }
        if (this.closeOnly) {
            this.state = State.CLOSING;
        } else if (perpPosition && percentage_difference_as_natural(perpPosition.openNotionalOriginal.toNumber(), this.totalNotional) > 50) {
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
                switch (this.state) {
                    case State.OPENING: {
                        const perpPositionSize = perpPosition?.sizeAbs?.toNumber() || 0;
                        const hedgePositionSize = hedgePosition?.size || 0;
                        const sizeDiff = Math.abs(perpPositionSize - hedgePositionSize);
                        if (sizeDiff > 0) {
                            // upsize hedge
                            // UP TO HERE
                            // await this.perpClient.placeOrder()
                        } else {
                            // upsize perp
                        }
                    }
                    case State.CLOSING: {

                    }
                }
            } else if (validity.positionState === PositionState.WRONG_DIRECTION) {

            }
        } catch (err) {}
    }
}
