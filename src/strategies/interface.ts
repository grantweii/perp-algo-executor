import { Direction, Exchange, Market } from '../connectors/common';
import { HttpClient } from '../connectors/interface';
import { PerpV2Client } from '../connectors/perpetual_protocol_v2';

export enum Event {
    PerpFill = 'PERP_FILL',
}

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

export enum State {
    OPENING = 'OPENING',
    CLOSING = 'CLOSING',
}

export enum PositionState {
    VALID = 'VALID',
    WRONG_DIRECTION = 'WRONG_DIRECTION',
    UNBALANCED = 'UNBALANCED',
}

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
