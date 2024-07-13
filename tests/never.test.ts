import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("never()", () => {
  it("rejects everything", () => {
    const t = v.never();
    for (const val of ["1", 1, 1n, true, null, undefined, [], {}]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });
  it("has output type 'never'", () => {
    const t = v.never();
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<never>();
  });
  it("never propagates to assert()", () => {
    let called = false;
    const t = v.never().assert(() => {
      called = true;
      return true;
    });
    expect(() => t.parse(null)).to.throw(v.ValitaError);
    expect(called).to.be.false;
  });
  it("never propagates to map()", () => {
    let called = false;
    const t = v.never().map(() => {
      called = true;
    });
    expect(() => t.parse(null)).to.throw(v.ValitaError);
    expect(called).to.be.false;
  });
  it("never propagates to chain()", () => {
    let called = false;
    const t = v.never().chain(() => {
      called = true;
      return v.ok(true);
    });
    expect(() => t.parse(null)).to.throw(v.ValitaError);
    expect(called).to.be.false;
  });
});
