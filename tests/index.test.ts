import { expect } from "chai";
import { TypeEqual } from "ts-expect";
import * as v from "../src";

// A helper for checking whether the given validator's
// inferred output type is _exactly_ the same as given one.
// For example the following are valid:
//  expectType(v.number()).toImply<number>(true);
//  expectType(v.number()).toImply<1>(false);
//  expectType(v.number()).toImply<string>(false);
//  expectType(v.number()).toImply<string | number>(false);
//  expectType(v.number()).toImply<unknown>(false);
//  expectType(v.number()).toImply<any>(false);
//  expectType(v.number()).toImply<never>(false);
function expectType<T extends v.Type>(
  _type: T
): {
  toImply<M>(_truth: TypeEqual<v.Infer<T>, M>): void;
} {
  return { toImply: () => void {} };
}

describe("Type", () => {
  describe("assert", () => {
    it("passes the type through by default", () => {
      const t = v.number().assert(() => true);
      expectType(t).toImply<number>(true);
    });
    it("accepts type predicates", () => {
      type Branded = number & { readonly brand: unique symbol };
      const t = v.number().assert((n): n is Branded => true);
      expectType(t).toImply<Branded>(true);
      expectType(t).toImply<number>(false);
    });
    it("passes in the parsed value", () => {
      let value: unknown;
      const t = v.number().assert((v) => {
        value = v;
        return true;
      });
      t.parse(1000);
      expect(value).to.equal(1000);
    });
    it("passes the value through on success", () => {
      const t = v.number().assert(() => true);
      expect(t.parse(1000)).to.equal(1000);
    });
    it("creates a custom error on failure", () => {
      const t = v.number().assert(() => false);
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.includes({ code: "custom_error" });
    });
    it("allows passing in a custom error message", () => {
      const t = v.number().assert(() => false, "test");
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "test",
        });
    });
    it("allows passing in a custom error message in an object", () => {
      const t = v.number().assert(() => false, { message: "test" });
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: { message: "test" },
        });
    });
    it("allows passing in a error path", () => {
      const t = v.number().assert(() => false, { path: ["test"] });
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          path: ["test"],
        });
    });
  });
  describe("map", () => {
    it("changes the output type to the function's return type", () => {
      const t = v.number().map(() => "test");
      expectType(t).toImply<string>(true);
    });
    it("passes in the parsed value", () => {
      let value: unknown;
      const t = v.number().map((v) => (value = v));
      t.parse(1000);
      expect(value).to.equal(1000);
    });
    it("passes on the return value", () => {
      const t = v.number().map(() => "test");
      expect(t.parse(1000)).to.equal("test");
    });
  });
  describe("chain", () => {
    it("changes the output type to the function's return type", () => {
      const t = v.number().chain(() => v.ok("test"));
      expectType(t).toImply<string>(true);
    });
    it("passes in the parsed value", () => {
      let value: unknown;
      const t = v.number().chain((n) => {
        value = n;
        return v.ok("test");
      });
      t.parse(1000);
      expect(value).to.equal(1000);
    });
    it("passes on the success value", () => {
      const t = v.number().chain(() => v.ok("test"));
      expect(t.parse(1)).to.equal("test");
    });
    it("fails on error result", () => {
      const t = v.number().chain(() => v.err());
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
        });
    });
    it("allows passing in a custom error message", () => {
      const t = v.number().chain(() => v.err("test"));
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "test",
        });
    });
    it("allows passing in a custom error message in an object", () => {
      const t = v.number().chain(() => v.err({ message: "test" }));
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: { message: "test" },
        });
    });
    it("allows passing in an error path", () => {
      const t = v.number().chain(() => v.err({ path: ["test"] }));
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          path: ["test"],
        });
    });
  });
  describe("optional()", () => {
    it("accepts missing values", () => {
      const t = v.object({
        a: v.string().optional(),
      });
      expect(t.parse({})).to.deep.equal({});
    });
    it("accepts undefined", () => {
      const t = v.object({
        a: v.string().optional(),
      });
      expect(t.parse({ a: undefined })).to.deep.equal({ a: undefined });
    });
    it("accepts the original type", () => {
      const t = v.object({
        missing: v.string().optional(),
      });
      expect(t.parse({ a: "test" })).to.deep.equal({ a: "test" });
    });
    it("doesn't add undefined to output if there's nothing overlapping nothing()", () => {
      const t = v
        .undefined()
        .map(() => 2)
        .optional();
      expectType(t).toImply<number>(true);
    });
    it("adds undefined to output if there's nothing overlapping undefined()", () => {
      const t = v.string().optional();
      expectType(t).toImply<string | undefined>(true);
    });
    it("makes the output undefined if there's nothing that can match", () => {
      const t = v
        .nothing()
        .map(() => 1)
        .optional();
      expectType(t).toImply<undefined>(true);
    });
    it("makes the output type optional the wrapped type doesn't contain nothing()", () => {
      const t1 = v.object({ a: v.number().optional() });
      expectType(t1).toImply<{ a?: number | undefined }>(true);

      const t2 = v.object({
        a: v
          .undefined()
          .map(() => 1)
          .optional(),
      });
      expectType(t2).toImply<{ a?: number | undefined }>(true);

      const t3 = v.object({
        a: v
          .unknown()
          .map(() => 1)
          .optional(),
      });
      expectType(t3).toImply<{ a?: number | undefined }>(true);

      const t4 = v.object({
        a: v
          .union(
            v.unknown().map(() => 1),
            v.undefined().map(() => 2)
          )
          .optional(),
      });
      expectType(t4).toImply<{ a?: number | undefined }>(true);
    });
    it("keeps the output type if there's something overlapping nothing() and undefined()", () => {
      const t1 = v.object({
        a: v
          .union(
            v.nothing().map(() => 1),
            v.undefined().map(() => 2)
          )
          .optional(),
      });
      expectType(t1).toImply<{ a: number }>(true);

      const t2 = v.object({
        a: v
          .union(
            v.nothing().map(() => 1),
            v.unknown().map(() => 2)
          )
          .optional(),
      });
      expectType(t2).toImply<{ a: number }>(true);

      const t3 = v.object({
        a: v
          .union(
            v.nothing().map(() => 1),
            v.undefined().map(() => 2),
            v.unknown().map(() => 3)
          )
          .optional(),
      });
      expectType(t3).toImply<{ a: number }>(true);
    });
    it("won't short-circuit unknown()", () => {
      const t = v.object({
        missing: v
          .undefined()
          .assert(() => false, "test")
          .optional(),
      });
      expect(() => t.parse({ missing: undefined }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "test",
        });
    });
    it("won't short-circuit undefined()", () => {
      const t = v.object({
        missing: v
          .undefined()
          .assert(() => false, "test")
          .optional(),
      });
      expect(() => t.parse({ missing: undefined }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "test",
        });
    });
    it("won't short-circuit nothing()", () => {
      const t = v.object({
        missing: v
          .nothing()
          .assert(() => false, "test")
          .optional(),
      });
      expect(() => t.parse({}))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "test",
        });
    });
    it("passes undefined to assert() for missing values", () => {
      let value: unknown = null;
      const t = v.object({
        missing: v
          .string()
          .optional()
          .assert((input) => {
            value = input;
            return true;
          }),
      });
      t.parse({});
      expect(value).to.be.undefined;
    });
    it("passes undefined to map() for missing values", () => {
      let value: unknown = null;
      const t = v.object({
        missing: v
          .string()
          .optional()
          .map((input) => {
            value = input;
          }),
      });
      t.parse({});
      expect(value).to.be.undefined;
    });
    it("passes undefined to chain() for missing values", () => {
      let value: unknown = null;
      const t = v.object({
        missing: v
          .string()
          .optional()
          .chain((input) => {
            value = input;
            return v.ok(true);
          }),
      });
      t.parse({});
      expect(value).to.be.undefined;
    });
  });
  describe("default", () => {
    it("accepts undefined", () => {
      const t = v.number().default(2);
      expect(t.parse(undefined)).to.deep.equal(2);
    });
    it("maps undefined output from any parser", () => {
      const t = v
        .string()
        .map(() => undefined)
        .default(2);
      expect(t.parse("test")).to.deep.equal(2);
    });
    it("makes input optional", () => {
      const t = v.object({
        a: v.number().default(2),
      });
      expect(t.parse({})).to.deep.equal({ a: 2 });
    });
    it("infers literals when possible", () => {
      const t = v.undefined().default(2);
      expectType(t).toImply<2>(true);
    });
    it("considers nothing's output undefined", () => {
      const t = v.nothing().default(2);
      expectType(t).toImply<2>(true);
    });
    it("removes undefined from the return type", () => {
      const t = v.union(v.string(), v.undefined()).default(2);
      expectType(t).toImply<string | 2>(true);
    });
    it("considers nothing's output undefined", () => {
      const t = v.nothing().default(2);
      expectType(t).toImply<2>(true);
    });
    it("considers nothing's output undefined in object keys", () => {
      const t = v.object({
        a: v
          .union(
            v.nothing(),
            v.undefined().map(() => "string")
          )
          .default(2),
      });
      expectType(t).toImply<{ a: 2 | string }>(true);
    });
  });
});

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
});

describe("unknown()", () => {
  it("accepts anything", () => {
    const t = v.unknown();
    for (const val of ["test", 1, 1n, true, null, undefined, [], {}]) {
      expect(t.parse(val)).to.equal(val);
    }
  });
});

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
});

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
});

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
});

describe("nothing()", () => {
  it("rejects everything", () => {
    const t = v.nothing();
    for (const val of ["1", 1, 1n, true, null, undefined, [], {}]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });
  it("has output type 'never'", () => {
    const t = v.nothing();
    expectType(t).toImply<never>(true);
  });
  it("passes undefined to assert()", () => {
    let value: unknown = null;
    const t = v.object({
      missing: v.nothing().assert((input) => {
        value = input;
        return true;
      }),
    });
    t.parse({});
    expect(value).to.be.undefined;
  });
  it("passes undefined to map()", () => {
    let value: unknown = null;
    const t = v.object({
      missing: v.nothing().map((input) => {
        value = input;
      }),
    });
    t.parse({});
    expect(value).to.be.undefined;
  });
  it("passes undefined to chain()", () => {
    let value: unknown = null;
    const t = v.object({
      missing: v.nothing().chain((input) => {
        value = input;
        return v.ok(true);
      }),
    });
    t.parse({});
    expect(value).to.be.undefined;
  });
  it("gets ignored on output type when it can't produce output", () => {
    const x = v.union(
      v.nothing().map(() => 1),
      v.unknown().map(() => "test")
    );
    expectType(x).toImply<string>(true);
  });
  it("won't get ignored as object values", () => {
    const x = v.object({
      a: v.union(
        v.nothing().map(() => 1),
        v.unknown().map(() => "test")
      ),
    });
    expectType(x).toImply<{ a: number | string }>(true);
  });
});

describe("object()", () => {
  it("acceps empty objects", () => {
    const t = v.object({});
    expect(t.parse({})).to.deep.equal({});
    // eslint-disable-next-line @typescript-eslint/ban-types
    expectType(t).toImply<{}>(true);
  });
  it("infers required keys object({})", () => {
    const t = v.object({
      a: v.object({}),
    });
    // eslint-disable-next-line @typescript-eslint/ban-types
    expectType(t).toImply<{ a: {} }>(true);
  });
  it("infers optional keys for optional()", () => {
    const t = v.object({
      a: v.undefined().optional(),
    });
    expectType(t).toImply<{ a?: undefined }>(true);
  });
  it("infers never for nothing()", () => {
    const t = v.object({
      a: v.nothing(),
    });
    expectType(t).toImply<{ a: never }>(true);
  });

  it("infers optional undefined for nothing().optional()", () => {
    const t = v.object({
      a: v.nothing().optional(),
    });
    expectType(t).toImply<{ a?: undefined }>(true);
  });
  it("infers required keys for undefined()", () => {
    const t = v.object({
      a: v.undefined(),
    });
    expectType(t).toImply<{ a: undefined }>(true);
  });
  it("infers required keys for unknown()", () => {
    const t = v.object({
      a: v.unknown(),
    });
    expectType(t).toImply<{ a: unknown }>(true);
  });
  it("infers optional keys for union of nothing() and base type", () => {
    const t = v.object({
      a: v.union(v.nothing(), v.string()),
    });
    expectType(t).toImply<{ a?: string }>(true);
  });
  it("throws on missing required keys", () => {
    const t = v.object({ a: v.string() });
    expect(() => t.parse({}))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0].code", "missing_key");
  });
  it("does not throw on missing optional keys", () => {
    const t = v.object({ a: v.string().optional() });
    expect(t.parse({})).to.deep.equal({});
  });
  it("returns the original object instance if possible", () => {
    const t = v.object({ a: v.number() });
    const o = { a: 1 };
    expect(t.parse(o)).to.equal(o);
  });
  it("returns a new object instance if the fields change", () => {
    const t = v.object({
      a: v.number().map(() => "test"),
    });
    const o = { a: 1 };
    expect(t.parse(o)).to.not.equal(o);
  });
  it("rejects other types", () => {
    const t = v.object({});
    for (const val of ["1", 1n, true, null, undefined, []]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });

  it("passes through unrecognized keys by default", () => {
    const t = v.object({ a: v.number() });
    const o = t.parse({ a: 1, b: 2 });
    expect(o).to.deep.equal({ a: 1, b: 2 });
  });
  it("passes through unrecognized keys when mode=passthrough", () => {
    const t = v.object({ a: v.number() });
    const o = t.parse({ a: 1, b: 2 }, { mode: "passthrough" });
    expect(o).to.deep.equal({ a: 1, b: 2 });
  });
  it("strips unrecognized keys when mode=strip", () => {
    const t = v.object({ a: v.number() });
    const o = t.parse({ a: 1, b: 2 }, { mode: "strip" });
    expect(o).to.deep.equal({ a: 1 });
  });
  it("fails on unrecognized keys when mode=strict", () => {
    const t = v.object({ a: v.number() });
    expect(() => t.parse({ a: 1, b: 2 }, { mode: "strict" }))
      .to.throw(v.ValitaError)
      .with.nested.include({
        "issues[0].code": "unrecognized_key",
        "issues[0].key": "b",
      });
  });
  it("forwards parsing mode to nested types", () => {
    const t = v.object({ nested: v.object({ a: v.number() }) });
    const i = { nested: { a: 1, b: 2 } };
    expect(t.parse(i)).to.equal(i);
    expect(t.parse(i, { mode: "passthrough" })).to.equal(i);
    expect(t.parse(i, { mode: "strip" })).to.deep.equal({ nested: { a: 1 } });
    expect(() => t.parse(i, { mode: "strict" })).to.throw(v.ValitaError);
  });

  describe("rest", () => {
    it("adds an index signature to the inferred type", () => {
      const t = v.object({ a: v.number() }).rest(v.number());
      expectType(t).toImply<{ [K: string]: number; a: number }>(true);
      expectType(t).toImply<{ a: number }>(false);
    });
  });

  it("attaches paths to issues", () => {
    const t = v.object({
      type: v.literal(2),
      other: v.literal("test"),
    });
    expect(() => t.parse({ type: 2, other: "not_test" }))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_literal",
        path: ["other"],
        expected: ["test"],
      });
  });
  it("attaches nested paths to issues", () => {
    const t = v.object({
      type: v.literal(2),
      other: v.object({
        key: v.literal("test"),
      }),
    });
    expect(() => t.parse({ type: 2, other: { key: "not_test" } }))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_literal",
        path: ["other", "key"],
        expected: ["test"],
      });
  });
});

describe("literal()", () => {
  it("accepts string literals", () => {
    const t = v.literal("test");
    expect(t.parse("test")).to.equal("test");
  });
  it("accepts number literals", () => {
    const t = v.literal(1);
    expect(t.parse(1)).to.equal(1);
  });
  it("accepts bigint literals", () => {
    const t = v.literal(1n);
    expect(t.parse(1n)).to.equal(1n);
  });
  it("accepts boolean literals", () => {
    const t = v.literal(true);
    expect(t.parse(true)).to.equal(true);
  });
  it("rejects other literals when expecting a string literal", () => {
    const t = v.literal("test");
    expect(() => t.parse("other")).to.throw(v.ValitaError);
    expect(() => t.parse(1)).to.throw(v.ValitaError);
    expect(() => t.parse(1n)).to.throw(v.ValitaError);
    expect(() => t.parse(true)).to.throw(v.ValitaError);
  });
  it("rejects other literals when expecting a numeric literal", () => {
    const t = v.literal(1);
    expect(() => t.parse("test")).to.throw(v.ValitaError);
    expect(() => t.parse(2)).to.throw(v.ValitaError);
    expect(() => t.parse(1n)).to.throw(v.ValitaError);
    expect(() => t.parse(true)).to.throw(v.ValitaError);
  });
  it("rejects other literals when expecting a bigint literal", () => {
    const t = v.literal(1n);
    expect(() => t.parse("test")).to.throw(v.ValitaError);
    expect(() => t.parse(1)).to.throw(v.ValitaError);
    expect(() => t.parse(2n)).to.throw(v.ValitaError);
    expect(() => t.parse(true)).to.throw(v.ValitaError);
  });
  it("rejects other literals when expecting a boolean literal", () => {
    const t = v.literal(true);
    expect(() => t.parse("test")).to.throw(v.ValitaError);
    expect(() => t.parse(1)).to.throw(v.ValitaError);
    expect(() => t.parse(1n)).to.throw(v.ValitaError);
    expect(() => t.parse(false)).to.throw(v.ValitaError);
  });
});

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
});

describe("union()", () => {
  it("accepts two subvalidators", () => {
    const t = v.union(v.string(), v.number());
    expect(t.parse("test")).to.equal("test");
    expect(t.parse(1)).to.equal(1);
    expect(() => t.parse({})).to.throw(v.ValitaError);
  });
  it("picks the first successful parse", () => {
    const t = v.union(
      v
        .string()
        .map(() => 1)
        .assert(() => false),
      v.string().map(() => 2)
    );
    expect(t.parse("test")).to.equal(2);
  });
  it("respects the order of overlapping parsers", () => {
    const a = v.literal(1).map(() => "literal");
    const b = v.number().map(() => "number");
    const c = v.unknown().map(() => "unknown");
    const u = v.union;
    expect(u(a, b, c).parse(1)).to.equal("literal");
    expect(u(a, c, b).parse(1)).to.equal("literal");
    expect(u(b, a, c).parse(1)).to.equal("number");
    expect(u(b, c, a).parse(1)).to.equal("number");
    expect(u(c, b, a).parse(1)).to.equal("unknown");
    expect(u(c, a, b).parse(1)).to.equal("unknown");
  });
  it("deduplicates strictly equal parsers", () => {
    const a = v.unknown().assert(() => false, "test");
    expect(() => v.union(a, a).parse(1))
      .to.throw(v.ValitaError)
      .with.property("issues")
      .with.lengthOf(1);
  });
  it("keeps the matching order when deduplicating", () => {
    const a = v.unknown().map(() => "a");
    const b = v.unknown().map(() => "b");
    expect(v.union(a, b, a).parse(1)).to.equal("a");
  });
  it("accepts more than two subvalidators", () => {
    const t = v.union(
      v.string(),
      v.number(),
      v.null(),
      v.undefined(),
      v.boolean()
    );
    expect(t.parse("test")).to.equal("test");
    expect(t.parse(1)).to.equal(1);
    expect(t.parse(null)).to.equal(null);
    expect(t.parse(undefined)).to.equal(undefined);
    expect(t.parse(true)).to.equal(true);
    expect(() => t.parse({})).to.throw(v.ValitaError);
  });
  it("reports the expected type even for literals when the base type doesn't match", () => {
    const t = v.union(v.literal(1), v.literal("test"));
    expect(() => t.parse(true))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_type",
        expected: ["number", "string"],
      });
  });
  it("reports the expected literals when the base type matches", () => {
    const t = v.union(v.literal(1), v.literal("test"));
    expect(() => t.parse(2))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_literal",
        expected: [1, "test"],
      });
  });
  it("reports the errors from a branch that doesn't overlap with any other branch", () => {
    const t = v.union(v.literal(1), v.number(), v.object({ a: v.number() }));
    expect(() => t.parse({ a: "test" }))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_type",
        path: ["a"],
        expected: ["number"],
      });
  });
  it("matches unknowns if nothing else matches", () => {
    const t = v.union(
      v.literal(1),
      v.literal(2),
      v.unknown().assert(() => false, "test")
    );
    expect(() => t.parse({ a: 1 }))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "custom_error",
        error: "test",
      });
  });
  it("considers unknown() to overlap with everything except nothing()", () => {
    const t = v.union(
      v.literal(1),
      v.literal(2).assert(() => false),
      v.unknown().assert(() => false)
    );
    expect(() => t.parse(2))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_union",
      });
  });
  it("considers unknown() to overlap with objects", () => {
    const t = v.union(
      v.unknown(),
      v.object({ type: v.literal("a") }),
      v.object({ type: v.literal("b") })
    );
    expect(t.parse({ type: "c" })).to.deep.equal({ type: "c" });
  });
  it("considers unknown() and nothing() to not overlap", () => {
    const t = v.union(
      v.nothing().assert(() => false, "nothing"),
      v.unknown().assert(() => false, "unknown")
    );
    expect(() => t.parse(2))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "custom_error",
        error: "unknown",
      });
  });
  it("considers nothing() to not overlap with base types", () => {
    const t = v.union(
      v.nothing().assert(() => false, "nothing"),
      v.number().assert(() => false, "number")
    );
    expect(() => t.parse(2))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "custom_error",
        error: "number",
      });
  });
  describe("of objects", () => {
    it("discriminates based on base types", () => {
      const t = v.union(
        v.object({ type: v.number() }),
        v.object({ type: v.string() })
      );
      expect(() => t.parse({ type: true }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: ["type"],
          expected: ["number", "string"],
        });
    });
    it("discriminates based on literal values", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.literal(2) })
      );
      expect(() => t.parse({ type: 3 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_literal",
          path: ["type"],
          expected: [1, 2],
        });
    });
    it("reports expected types in the order they were first listed", () => {
      const t1 = v.union(v.literal(2), v.string(), v.literal(2));
      expect(() => t1.parse(true))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: [],
          expected: ["number", "string"],
        });

      const t2 = v.union(v.string(), v.literal(2), v.string());
      expect(() => t2.parse(true))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: [],
          expected: ["string", "number"],
        });
    });
    it("reports expected literals in the order they were first listed", () => {
      const t1 = v.union(v.literal(2), v.literal(1), v.literal(2));
      expect(() => t1.parse(3))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_literal",
          path: [],
          expected: [2, 1],
        });

      const t2 = v.union(v.literal(1), v.literal(2), v.literal(1));
      expect(() => t2.parse(3))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_literal",
          path: [],
          expected: [1, 2],
        });
    });
    it("discriminates based on mixture of base types and literal values", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.string() })
      );
      expect(() => t.parse({ type: true }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: ["type"],
          expected: ["number", "string"],
        });
    });
    it("considers unknown() to overlap with everything except nothing()", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.unknown().assert(() => false) })
      );
      expect(() => t.parse({ type: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({ code: "invalid_union" });
    });
    it("considers unknown() to not overlap with nothing()", () => {
      const t = v.union(
        v.object({ type: v.nothing() }),
        v.object({ type: v.unknown().assert(() => false, "test") })
      );
      expect(() => t.parse({ type: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({ code: "custom_error", error: "test" });
    });
    it("considers nothing() to overlap with nothing()", () => {
      const t = v.union(
        v.object({ type: v.nothing() }),
        v.object({ type: v.nothing() })
      );
      expect(() => t.parse({ type: 1 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({ code: "invalid_union" });
    });
    it("considers nothing() to overlap with optional()", () => {
      const t = v.union(
        v.object({ type: v.nothing() }),
        v.object({ type: v.string().optional() })
      );
      expect(() => t.parse({ type: 1 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({ code: "invalid_union" });
    });
    it("considers nothing() to not overlap with base types", () => {
      const t = v.union(
        v.object({ type: v.nothing() }),
        v.object({ type: v.string().assert(() => false, "string") })
      );
      expect(() => t.parse({ type: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "string",
        });
    });
    it("considers literals to overlap with their base types", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.number() })
      );
      expect(() => t.parse({ type: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({ code: "invalid_union" });
    });
    it("considers equal literals to overlap", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.literal(1) })
      );
      expect(() => t.parse({ type: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({ code: "invalid_union" });
    });
    it("folds multiple overlapping types together in same branch", () => {
      const t = v.union(
        v.object({
          type: v.union(v.string(), v.union(v.string(), v.literal("test"))),
        }),
        v.object({
          type: v.union(v.literal(2).optional().optional(), v.undefined()),
          other: v.literal("test"),
        })
      );
      expect(() => t.parse({ type: 2, other: "not_test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_literal",
          path: ["other"],
          expected: ["test"],
        });
    });
    it("considers two optionals to overlap", () => {
      const t = v.union(
        v.object({ type: v.literal(1).optional() }),
        v.object({ type: v.literal(2).optional() })
      );
      expect(() => t.parse({ type: 3 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0].code", "invalid_union");
    });
    it("considers two optionals and undefineds to overlap", () => {
      const t = v.union(
        v.object({ type: v.undefined() }),
        v.object({ type: v.literal(2).optional() })
      );
      expect(() => t.parse({ type: 3 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0].code", "invalid_union");
    });
    it("considers two unions with partially same types to overlap", () => {
      const t = v.union(
        v.object({ type: v.union(v.literal(1), v.literal(2)) }),
        v.object({ type: v.union(v.literal(2), v.literal(3)) })
      );
      expect(() => t.parse({ type: 4 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0].code", "invalid_union");
    });
  });
});

describe("ValitaError", () => {
  const error = new v.ValitaError({
    code: "invalid_type",
    expected: ["bigint"],
  });
  it("is derived from Error", () => {
    expect(error).to.be.instanceof(Error);
  });
  it("has a name", () => {
    expect(error.name).to.equal("ValitaError");
  });
  it("lists issues", () => {
    expect(error.issues).to.deep.equal([
      {
        path: [],
        code: "invalid_type",
        expected: ["bigint"],
      },
    ]);
  });
  it("supports multiple issues", () => {
    const error = new v.ValitaError({
      code: "join",
      left: {
        code: "invalid_type",
        expected: ["bigint"],
      },
      right: {
        code: "prepend",
        key: "first",
        tree: {
          code: "invalid_type",
          expected: ["string"],
        },
      },
    });
    expect(error.issues).to.deep.equal([
      {
        path: [],
        code: "invalid_type",
        expected: ["bigint"],
      },
      {
        path: ["first"],
        code: "invalid_type",
        expected: ["string"],
      },
    ]);
  });
  it("caches the issues list", () => {
    expect(error.issues).to.equal(error.issues);
  });
});
