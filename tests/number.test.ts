import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("number()", () => {
  it("accepts numbers", () => {
    const t = v.number();
    expect(t.parse(1)).to.equal(1);
  });
  it("rejects other types", () => {
    const t = v.number();
    for (const val of ["1", 1n, true, null, undefined, [], {}]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });
  it("has output type 'number'", () => {
    const t = v.number();
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<number>();
  });
});
