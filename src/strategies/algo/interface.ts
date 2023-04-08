import { Direction, Exchange } from "../../connectors/common";
import { ExecutionParameters, ExecutionType } from "../execution/interface";
import { HedgeInfo, PerpInfo } from "../interface";

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