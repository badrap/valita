import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("null()", () => {
  it("accepts null", () => {
    const t = v.null();
    expect(t.parse(null)).to.equal(null);
  });
  it("rejects other types", () => {
    const t = v.null();
    for (const val of ["1", 1, 1n, true, undefined, [], {}]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });
  it("has output type 'null'", () => {
    const _t = v.null();
    expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<null>();
  });
});
