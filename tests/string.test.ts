import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("string()", () => {
  it("accepts strings", () => {
    const t = v.string();
    expect(t.parse("test")).to.equal("test");
  });
  it("rejects other types", () => {
    const t = v.string();
    for (const val of [1, 1n, true, null, undefined, [], {}]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });
  it("has output type 'string'", () => {
    const t = v.string();
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<string>();
  });
});
