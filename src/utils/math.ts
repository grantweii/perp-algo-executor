
// https://www.mathsisfun.com/percentage-difference.html
export const signed_percentage_difference_as_natural = (a: number, b: number) =>
    (a - b) / ((a + b) / 2);

export const signed_percentage_difference_as_bps = (a: number, b: number) =>
    (a - b) / ((a + b) / 2) * 10000;

export const bpsToNatural = (bps: number) => bps / 10000;

export const naturalToBps = (naturalUnits: number) => naturalUnits * 10000;

export const bpsToPercent = (bps: number) => bps / 100;

export const percentToBps = (percentage: number) => percentage * 100;

export const percentToNatural = (percentage: number) => percentage / 100;

export const naturalToPercent = (naturalUnits: number) => naturalUnits * 100;