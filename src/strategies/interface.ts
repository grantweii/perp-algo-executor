import { Exchange, Market } from '../connectors/common';
import { HttpClient } from '../connectors/interface';
import { PerpV2Client } from '../connectors/perpetual_protocol_v2';

export type FundingRateEngineParameters = {
    hedgeClient: HttpClient;
    perpClient: PerpV2Client;
    perpMarket: Market;
    hedgeMarket: Market;
    executionParams: ExecutionParameters;
    totalNotional: number;
    perpDirection: Direction;
    closeOnly?: boolean;
    pollInterval?: number; // milliseconds
    slippage?: number; // in bps
    acceptableDifference?: number; // in bps
};

export type FundingRateConfig = {
    STRATEGY: ExecutionType;
    HEDGE_EXCHANGE: Exchange;
    TOTAL_NOTIONAL: number;
    PERP_DIRECTION: Direction;
    CLOSE_ONLY?: boolean;
    ORDER_NOTIONAL?: number;
    MIN_SPREAD?: number; // in bps
    PARTS?: number;
    PERIOD?: string;
    POLL_INTERVAL?: number; // milliseconds
    SLIPPAGE?: number; // in bps
    ACCEPTABLE_DIFFERENCE?: number; // in bps
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
export interface FundingExecution {
    orderNotional: number;
    canExecute(): Promise<CanExecuteResponse>;
}
