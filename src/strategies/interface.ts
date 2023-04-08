import { Exchange, Market } from '../connectors/common';
import { HttpClient } from '../connectors/interface';
import { PerpV2Client } from '../connectors/perpetual_protocol_v2';

export type HedgeInfo = {
    enabled: boolean;
    client: HttpClient;
    market: Market;
    direction: Direction;
};

export type PerpInfo = {
    client: PerpV2Client;
    market: Market;
    direction: Direction;
};

export type AlgoEngineParameters = {
    hedge?: HedgeInfo;
    perp: PerpInfo;
    executionParams: ExecutionParameters;
    totalNotional: number;
    closeOnly?: boolean;
    pollInterval?: number; // milliseconds
    slippage?: number; // in bps
    acceptableDifference?: number; // in bps
};

export type AlgoEngineConfig = {
    HEDGE?: {
        ENABLED: boolean;
        EXCHANGE: Exchange;
        QUOTE_TOKEN: string;
    };
    EXECUTION: {
        STRATEGY: ExecutionType;
        // twap params
        PARTS?: number;
        PERIOD?: string;
        // spread params
        ORDER_NOTIONAL?: number;
        MIN_SPREAD?: number; // in bps
    };
    TOTAL_NOTIONAL: number;
    PERP_DIRECTION: Direction;
    CLOSE_ONLY?: boolean;
    POLL_INTERVAL?: number; // milliseconds
    SLIPPAGE?: number; // in bps
    ACCEPTABLE_DIFFERENCE?: number; // in bps
    HIDE_SIZE?: boolean;
};

export enum State {
    OPENING = 'OPENING',
    CLOSING = 'CLOSING',
}

export enum ExecutionType {
    Spread = 'spread',
    Twap = 'twap',
}

export enum Direction {
    Long = 'long',
    Short = 'short',
}

export enum PositionState {
    VALID = 'VALID',
    WRONG_DIRECTION = 'WRONG_DIRECTION',
    UNBALANCED = 'UNBALANCED',
}

export type SpreadParameters = {
    strategy: ExecutionType.Spread;
    minSpread: number;
    orderNotional: number;
};

export type TwapParameters = {
    strategy: ExecutionType.Twap;
    parts: number;
    period: string;
};

export type ExecutionParameters = SpreadParameters | TwapParameters;

export type HedgeParameters = {
    enabled: boolean;
    exchange: Exchange;
    quoteToken: string;
};

export type ValidPosition = {
    positionState: PositionState.VALID;
};

export type InvalidPosition = {
    positionState: PositionState.UNBALANCED | PositionState.WRONG_DIRECTION;
    message: string;
};

export type PositionValidity = ValidPosition | InvalidPosition;

export type ExecutionRequest = {
    orderSize: number; // size not notional, must be abs
    price: number;
};

export type CanExecuteResponse = false | ExecutionRequest;

export type CheckTwapParameters = {
    market: Market;
};

/**
 * Determines if execution conditions are met.
 */
export interface Execution {
    orderNotional: number;
    canExecute(): Promise<CanExecuteResponse>;
    onSuccess(): void;
}
