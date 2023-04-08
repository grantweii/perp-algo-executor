import { Direction, Market } from '../../common';

export type PlacePerpV2Order = {
    market: Market;
    slippage?: number; // in bps
    direction: Direction;
    size: number;
};

export type GetQuote = {
    market: Market;
    direction: Direction;
    amount: number;
    amountType: 'base' | 'quote';
};
