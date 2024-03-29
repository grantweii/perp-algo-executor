import Big from 'big.js';

// https://www.mathsisfun.com/percentage-difference.html
export const signed_percentage_difference_as_natural = (a: number, b: number) =>
    (a - b) / ((a + b) / 2);

export const signed_percentage_difference_as_bps = (a: number, b: number) =>
    ((a - b) / ((a + b) / 2)) * 10000;

export const bpsToNatural = (bps: number) => bps / 10000;

export const naturalToBps = (naturalUnits: number) => naturalUnits * 10000;

export const bpsToPercent = (bps: number) => bps / 100;

export const percentToBps = (percentage: number) => percentage * 100;

export const percentToNatural = (percentage: number) => percentage / 100;

export const naturalToPercent = (naturalUnits: number) => naturalUnits * 100;

export const roundUp = (num: number, increment: number) => {
    const dps = -Math.log10(increment);
    return new Big(num).round(dps, Big.roundUp).toNumber();
};

export const roundDown = (num: number, increment: number) => {
    const dps = -Math.log10(increment);
    return new Big(num).round(dps, Big.roundDown).toNumber();
};

export const round = (num: number, increment: number) => {
    const dps = -Math.log10(increment);
    return new Big(num).round(dps).toNumber();
};

export const generateRandomBetween = (min: number, max: number) => {
    return Math.random() * (max - min) + min;
};
