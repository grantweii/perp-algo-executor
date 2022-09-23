import { Side } from '../../common';

export type PlacePerpV2Order = {
    market: string,
    slippage: number,
    side: Side,
    size: number,
}
