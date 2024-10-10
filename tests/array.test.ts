import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("array()", () => {
  it("accepts arrays", () => {
    const t = v.array(v.number());
    expect(t.parse([1])).to.deep.equal([1]);
  });

  it("rejects other types", () => {
    const t = v.array(v.number());
    for (const val of ["1", 1n, true, null, undefined, { 0: 1 }]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });

  it("throws on item mismatch", () => {
    const t = v.array(v.string());
    expect(() => t.parse([1])).to.throw(v.ValitaError);
  });

  it("returns the original array instance if possible", () => {
    const t = v.array(v.number());
    const a = [1];
    expect(t.parse(a)).to.equal(a);
  });

  it("returns a new array instance if the items change", () => {
    const t = v.array(v.number().map(() => "test"));
    const a = [1];
    expect(t.parse(a)).to.not.equal(a);
  });

  it("infers array", () => {
    const t = v.array(v.number());
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<number[]>();
  });

  describe("concat()", () => {
    it("creates a variadic tuple from an array and a fixed-length tuple", () => {
      const s = v.string();
      const t = v.tuple([v.number(), v.number()]).concat(v.array(v.string()));
      expect(t.prefix).toHaveLength(2);
      expect(t.rest).toStrictEqual(s);
      expect(t.suffix).to.toHaveLength(0);
    });

    it("prohibits concatenating variadic types at type level", () => {
      const t = v.array(v.string());

      try {
        // @ts-expect-error two variadic tuples can't be concatenated
        t.concat(v.tuple([]).concat(v.array(v.number())));
      } catch {
        // pass
      }

      try {
        // @ts-expect-error an array can't be concatenated to a variadic tuple
        t.concat(v.array(v.number()));
      } catch {
        // pass
      }
    });

    it("prohibits concatenating variadic types at runtime", () => {
      const t: { concat(v: unknown): unknown } = v.array(v.string());

      expect(() => t.concat(v.tuple([]).concat(v.array(v.number())))).to.throw(
        TypeError,
        "can not concatenate two variadic types",
      );
      expect(() => t.concat(v.array(v.number()))).to.throw(
        TypeError,
        "can not concatenate two variadic types",
      );
    });
  });
});
