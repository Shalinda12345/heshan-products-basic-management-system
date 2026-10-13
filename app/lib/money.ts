// Round a currency amount to 2 decimals (the precision of the DOUBLE(10,2) money columns).
export function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}
