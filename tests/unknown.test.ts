import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("unknown()", () => {
  it("accepts anything", () => {
    const t = v.unknown();
    for (const val of ["test", 1, 1n, true, null, undefined, [], {}]) {
      expect(t.parse(val)).to.equal(val);
    }
  });
  it("has output type 'unknown'", () => {
    const t = v.unknown();
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<unknown>();
  });
});
