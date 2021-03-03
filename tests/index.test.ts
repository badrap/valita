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
  describe("apply", () => {
    it("changes the output type to the function's return type", () => {
      const t = v.number().apply(() => "test");
      expectType(t).toImply<string>(true);
    });
    it("passes in the parsed value", () => {
      let value: unknown;
      const t = v.number().apply((v) => (value = v));
      t.parse(1000);
      expect(value).to.equal(1000);
    });
    it("passes on the return value", () => {
      const t = v.number().apply(() => "test");
      expect(t.parse(1000)).to.equal("test");
    });
  });
  describe("chain", () => {
    it("changes the output type to the function's return type", () => {
      const t = v.number().chain(() => ({ ok: true, value: "test" }));
      expectType(t).toImply<string>(true);
    });
    it("passes in the parsed value", () => {
      let value: unknown;
      const t = v.number().chain((v) => {
        value = v;
        return { ok: true, value: "test" };
      });
      t.parse(1000);
      expect(value).to.equal(1000);
    });
    it("passes on the success value", () => {
      const t = v.number().chain(() => ({ ok: true, value: "test" }));
      expect(t.parse(1)).to.equal("test");
    });
    it("fails on error result", () => {
      const t = v.number().chain(() => ({ ok: false }));
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
        });
    });
    it("allows passing in a custom error message", () => {
      const t = v.number().chain(() => ({ ok: false, error: "test" }));
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "test",
        });
    });
    it("allows passing in a custom error message in an object", () => {
      const t = v
        .number()
        .chain(() => ({ ok: false, error: { message: "test" } }));
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: { message: "test" },
        });
    });
    it("allows passing in an error path", () => {
      const t = v
        .number()
        .chain(() => ({ ok: false, error: { path: ["test"] } }));
      expect(() => t.parse(1))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          path: ["test"],
        });
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

describe("object()", () => {
  it("acceps empty objects", () => {
    const t = v.object({});
    expect(t.parse({})).to.deep.equal({});
    // eslint-disable-next-line @typescript-eslint/ban-types
    expectType(t).toImply<{}>(true);
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
  // it("returns a new object instance if the fields change", () => {
  //   const t = v.object({
  //     a: v.number().transform((n) => ({ code: "ok", value: "" + n })),
  //   });
  //   const o = { a: 1 };
  //   expect(t.parse(o)).to.not.equal(o);
  // });
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
  // it("returns a new array instance if the items change", () => {
  //   const t = v.array(
  //     v.number().transform((n) => ({ code: "ok", value: "" + n }))
  //   );
  //   const a = [1];
  //   expect(t.parse(a)).to.not.equal(a);
  // });
});

describe("union()", () => {
  it("accepts two subvalidators", () => {
    const t = v.union(v.string(), v.number());
    expect(t.parse("test")).to.equal("test");
    expect(t.parse(1)).to.equal(1);
    expect(() => t.parse({})).to.throw(v.ValitaError);
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
