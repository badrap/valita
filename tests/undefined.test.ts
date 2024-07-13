import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("undefined()", () => {
  it("accepts undefined", () => {
    const t = v.undefined();
    expect(t.parse(undefined)).to.equal(undefined);
  });
  it("rejects other types", () => {
    const t = v.undefined();
    for (const val of ["1", 1, 1n, true, null, [], {}]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });
  it("has output type 'undefined'", () => {
    const t = v.undefined();
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<undefined>();
  });
});
