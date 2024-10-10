import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("tuple()", () => {
  it("returns a fixed-length tuple", () => {
    const t = v.tuple([v.number(), v.number()]);
    expect(t.prefix).toHaveLength(2);
    expect(t.rest).to.be.undefined;
    expect(t.suffix).to.toHaveLength(0);
  });

  describe("concat()", () => {
    it("creates a fixed-length tuple from two fixed-length tuples", () => {
      const t = v.tuple([v.number()]).concat(v.tuple([v.string()]));
      expect(t.prefix).to.toHaveLength(2);
      expect(t.rest).to.be.undefined;
      expect(t.suffix).to.toHaveLength(0);
    });

    it("creates a variadic tuple from a fixed-length tuple and an array", () => {
      const s = v.string();
      const t = v.tuple([v.number(), v.number()]).concat(v.array(v.string()));
      expect(t.prefix).toHaveLength(2);
      expect(t.rest).toStrictEqual(s);
      expect(t.suffix).to.toHaveLength(0);
    });

    it("creates a variadic tuple from a variadic and a fixed-length tuple", () => {
      const n = v.number();
      const b = v.boolean();
      const s = v.string();
      const u = v.undefined();

      const t1 = v.tuple([n, b]).concat(v.array(s));
      const t = t1.concat(v.tuple([u]));
      expect(t.prefix).toEqual([n, b]);
      expect(t.rest).toStrictEqual(s);
      expect(t.suffix).toEqual([u]);
    });

    it("creates a variadic tuple from a fixed-length and a variadic tuple", () => {
      const n = v.number();
      const b = v.boolean();
      const s = v.string();
      const i = v.bigint();
      const u = v.undefined();

      const t1 = v.tuple([n, b]);
      const t2 = v
        .tuple([i])
        .concat(v.array(s))
        .concat(v.tuple([u]));
      const t = t1.concat(t2);
      expect(t.prefix).toEqual([n, b, i]);
      expect(t.rest).toStrictEqual(s);
      expect(t.suffix).toEqual([u]);
    });

    it("prohibits concatenating variadic types at type level", () => {
      const t = v.tuple([]).concat(v.array(v.number()));

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
      const t: { concat(v: unknown): unknown } = v
        .tuple([])
        .concat(v.array(v.number()));

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

  describe("fixed-length tuple", () => {
    it("accepts arrays", () => {
      const t = v.tuple([v.number(), v.number()]);
      expect(t.parse([1, 1])).to.deep.equal([1, 1]);
    });

    it("rejects non-arrays", () => {
      const t = v.tuple([v.number(), v.number()]);
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: [],
          expected: ["array"],
        });
    });

    it("accepts tuples of different types", () => {
      const t = v.tuple([v.number(), v.string()]);
      expect(t.parse([1, "string"])).to.deep.equal([1, "string"]);
    });

    it("throws on item mismatch", () => {
      const t = v.tuple([v.number(), v.string()]);
      expect(() => t.parse([1, 1]))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: [1],
          expected: ["string"],
        });
    });

    it("throws on minimum length mismatch", () => {
      const t = v.tuple([v.number(), v.number()]);
      expect(() => t.parse([1]))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_length",
          path: [],
          minLength: 2,
          maxLength: 2,
        });
    });

    it("throws on maximum length mismatch", () => {
      const t = v.tuple([v.number(), v.number()]);
      expect(() => t.parse([1, 1, 1]))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_length",
          path: [],
          minLength: 2,
          maxLength: 2,
        });
    });

    it("infers tuple", () => {
      const t = v.tuple([v.number(), v.string()]);
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<[number, string]>();
    });

    it("returns the original array instance if possible", () => {
      const t = v.tuple([v.number(), v.number()]);
      const a = [1, 2];
      expect(t.parse(a)).to.equal(a);
    });

    it("returns a new array instance if the items change", () => {
      const t = v.tuple([v.number().map(() => "test"), v.number()]);
      const a = [1, 2];
      expect(t.parse(a)).to.not.equal(a);
    });
  });

  describe("variadic tuple with an empty suffix", () => {
    it("accepts arrays", () => {
      const t = v.tuple([v.number(), v.string()]).concat(v.array(v.boolean()));
      expect(t.parse([1, "foo", true])).to.deep.equal([1, "foo", true]);
    });

    it("rejects non-arrays", () => {
      const t = v.tuple([v.number(), v.string()]).concat(v.array(v.boolean()));
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: [],
          expected: ["array"],
        });
    });

    it("accepts variable length arrays", () => {
      const t = v.tuple([v.number(), v.string()]).concat(v.array(v.boolean()));
      expect(t.parse([1, "foo"])).to.deep.equal([1, "foo"]);
      expect(t.parse([1, "foo", true])).to.deep.equal([1, "foo", true]);
      expect(t.parse([1, "foo", true, false])).to.deep.equal([
        1,
        "foo",
        true,
        false,
      ]);
      expect(t.parse([1, "foo", false, true, false])).to.deep.equal([
        1,
        "foo",
        false,
        true,
        false,
      ]);
    });

    it("throws on item mismatch", () => {
      const t = v.tuple([v.number(), v.string()]).concat(v.array(v.boolean()));
      expect(() => t.parse([1, "foo", 1]))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: [2],
          expected: ["boolean"],
        });
    });

    it("throws on minimum length mismatch", () => {
      const t = v.tuple([v.number(), v.string()]).concat(v.array(v.boolean()));
      expect(() => t.parse([1]))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_length",
          path: [],
          minLength: 2,
          maxLength: undefined,
        });
    });

    it("infers a variadic tuple", () => {
      const t = v.tuple([v.number(), v.string()]).concat(v.array(v.boolean()));
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<
        [number, string, ...boolean[]]
      >();
    });

    it("returns the original array instance if possible", () => {
      const t = v.tuple([v.number(), v.string()]).concat(v.array(v.boolean()));
      const a = [1, "foo", true];
      expect(t.parse(a)).to.equal(a);
    });

    it("returns a new array instance if the items change", () => {
      const t = v
        .tuple([v.number(), v.string()])
        .concat(v.array(v.boolean().map(() => "test")));
      const a = [1, "foo", true];
      expect(t.parse(a)).to.not.equal(a);
    });
  });

  describe("variadic tuple with a non-empty suffix", () => {
    it("accepts arrays", () => {
      const t = v
        .tuple([v.number()])
        .concat(v.array(v.boolean()))
        .concat(v.tuple([v.string(), v.null()]));
      expect(t.parse([1, true, "foo", null])).to.deep.equal([
        1,
        true,
        "foo",
        null,
      ]);
    });

    it("rejects non-arrays", () => {
      const t = v
        .tuple([v.number()])
        .concat(v.array(v.boolean()))
        .concat(v.tuple([v.string(), v.null()]));
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: [],
          expected: ["array"],
        });
    });

    it("accepts variable length arrays", () => {
      const t = v
        .tuple([v.number()])
        .concat(v.array(v.boolean()))
        .concat(v.tuple([v.string(), v.null()]));
      expect(t.parse([1, "foo", null])).to.deep.equal([1, "foo", null]);
      expect(t.parse([1, true, "foo", null])).to.deep.equal([
        1,
        true,
        "foo",
        null,
      ]);
      expect(t.parse([1, false, true, "foo", null])).to.deep.equal([
        1,
        false,
        true,
        "foo",
        null,
      ]);
      expect(t.parse([1, true, false, true, "foo", null])).to.deep.equal([
        1,
        true,
        false,
        true,
        "foo",
        null,
      ]);
    });

    it("throws on item mismatch", () => {
      const t = v
        .tuple([v.number()])
        .concat(v.array(v.boolean()))
        .concat(v.tuple([v.string(), v.null()]));
      expect(() => t.parse([1, true, "foo", 1]))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: [3],
          expected: ["null"],
        });
    });

    it("throws on minimum length mismatch", () => {
      const t = v
        .tuple([v.number()])
        .concat(v.array(v.boolean()))
        .concat(v.tuple([v.string(), v.null()]));
      expect(() => t.parse([1, true]))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_length",
          path: [],
          minLength: 3,
          maxLength: undefined,
        });
    });

    it("infers a variadic tuple with a suffix", () => {
      const t = v
        .tuple([v.number()])
        .concat(v.array(v.boolean()))
        .concat(v.tuple([v.string(), v.null()]));
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<
        [number, ...boolean[], string, null]
      >();
    });

    it("returns the original array instance if possible", () => {
      const t = v
        .tuple([v.number()])
        .concat(v.array(v.boolean()))
        .concat(v.tuple([v.string(), v.null()]));
      const a = [1, true, "foo", null];
      expect(t.parse(a)).to.equal(a);
    });

    it("returns a new array instance if the items change", () => {
      const t = v
        .tuple([v.number()])
        .concat(v.array(v.boolean()))
        .concat(v.tuple([v.string(), v.null().map(() => "test")]));
      const a = [1, true, "foo", null];
      expect(t.parse(a)).to.not.equal(a);
    });
  });
});
