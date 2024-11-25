import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("bigint()", () => {
  it("accepts bigints", () => {
    const t = v.bigint();
    expect(t.parse(1n)).to.equal(1n);
  });
  it("rejects other types", () => {
    const t = v.bigint();
    for (const val of ["1", 1, true, null, undefined, [], {}]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });
  it("has output type 'bigint'", () => {
    const _t = v.bigint();
    expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<bigint>();
  });
});
