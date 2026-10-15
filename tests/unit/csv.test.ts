import { describe, expect, it } from "vitest";
import { toCsv } from "@/app/lib/csv";

const csv = (values: (string | number | null)[]) =>
    toCsv(values.map((v) => ({ v })), [{ header: "Value", value: (row) => row.v }]).replace(/^\uFEFF/, "").trim().split("\r\n").slice(1);

describe("toCsv", () => {
    it("defuses text that a spreadsheet would run as a formula", () => {
        expect(csv(["=SUM(A1)", "+1", "-cmd", "@x"])).toEqual(['"\'=SUM(A1)"', '"\'+1"', '"\'-cmd"', '"\'@x"']);
    });

    it("keeps negative amounts as numbers", () => {
        expect(csv(["-2120.00", -5, "-0.5"])).toEqual(['"-2120.00"', '"-5"', '"-0.5"']);
    });

    it("quotes every cell and doubles quotes inside it", () => {
        expect(csv(['He said "hi"', null])).toEqual(['"He said ""hi"""', '""']);
    });
});
