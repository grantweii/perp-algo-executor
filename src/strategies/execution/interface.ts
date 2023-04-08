export enum ExecutionType {
    Spread = 'spread',
    Twap = 'twap',
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

export type ExecutionRequest = {
    orderSize: number; // size not notional, must be abs
    price: number;
};

export type CanExecuteResponse = false | ExecutionRequest;

/**
 * Determines if execution conditions are met.
 */
export interface Execution {
    orderNotional: number;
    canExecute(): Promise<CanExecuteResponse>;
    onSuccess(): void;
}
