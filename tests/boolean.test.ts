import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("boolean()", () => {
  it("accepts booleans", () => {
    const t = v.boolean();
    expect(t.parse(true)).to.equal(true);
  });
  it("rejects other types", () => {
    const t = v.boolean();
    for (const val of ["1", 1, 1n, null, undefined, [], {}]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });
  it("has output type 'boolean'", () => {
    const _t = v.boolean();
    expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<boolean>();
  });
});
