import { describe, expect, it } from "vitest";
import { roundMoney } from "@/app/lib/money";

describe("roundMoney", () => {
    it.each([
        [0.1 * 3, 0.3],
        [3 * 33.33, 99.99],
        [150 * 3, 450],
        [12.346, 12.35],
        [-2.5, -2.5],
        [0, 0],
    ])("rounds %d to %d", (input, expected) => {
        expect(roundMoney(input)).toBe(expected);
    });
});
