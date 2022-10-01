import { Market, Side } from '../../common';

export type PlacePerpV2Order = {
    market: Market,
    slippage: number,
    side: Side,
    size: number,
}
