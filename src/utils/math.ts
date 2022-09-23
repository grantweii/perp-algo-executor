
// https://www.mathsisfun.com/percentage-difference.html
export const percentage_difference_as_natural = (a: number, b: number) =>
    Math.abs((a - b) / ((a + b) / 2)) / 100;
