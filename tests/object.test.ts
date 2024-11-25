import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("object()", () => {
  it("acceps empty objects", () => {
    const t = v.object({});
    expect(t.parse({})).to.deep.equal({});
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{}>();
  });
  it("infers required keys object({})", () => {
    const _t = v.object({
      a: v.object({}),
    });
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<{ a: {} }>();
  });
  it("infers optional keys for optional()", () => {
    const _t = v.object({
      a: v.undefined().optional(),
    });
    expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<{ a?: undefined }>();
  });
  it("infers required keys for never()", () => {
    const _t = v.object({
      a: v.never(),
    });
    expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<{ a: never }>();
  });
  it("infers required keys for undefined()", () => {
    const _t = v.object({
      a: v.undefined(),
    });
    expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<{ a: undefined }>();
  });
  it("infers required keys for unknown()", () => {
    const _t = v.object({
      a: v.unknown(),
    });
    expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<{ a: unknown }>();
  });
  it("throws on missing required keys", () => {
    const t = v.object({ a: v.string() });
    expect(() => t.parse({}))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0].code", "missing_value");
  });
  it("reports multiple missing required keys", () => {
    const result = v.object({ a: v.string(), b: v.number() }).try({});
    expect(!result.ok && result.issues).to.have.deep.members([
      {
        path: ["a"],
        code: "missing_value",
      },
      {
        path: ["b"],
        code: "missing_value",
      },
    ]);
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
  it("supports more than 32 keys (33rd key required)", () => {
    const shape: Record<string, v.Type | v.Optional> = {};
    for (let i = 0; i < 32; i++) {
      shape[`key-${i}`] = v.unknown().optional();
    }
    shape["key-32"] = v.unknown();
    expect(() => v.object(shape).parse({})).to.throw(
      v.ValitaError,
      "missing_value at .key-32 (missing value)",
    );
  });
  it("supports more than 32 keys (33rd key optional)", () => {
    const shape: Record<string, v.Type | v.Optional> = {};
    shape["key-0"] = v.unknown();
    for (let i = 1; i <= 32; i++) {
      shape[`key-${i}`] = v.unknown().optional();
    }
    expect(() => v.object(shape).parse({ "key-32": 1 })).to.throw(
      v.ValitaError,
      "missing_value at .key-0 (missing value)",
    );
  });
  it("doesn't lose enumerable optional keys when there are transformed non-enumerable optional keys", () => {
    const o = { a: 1 };
    Object.defineProperty(o, "b", {
      value: 2,
      enumerable: false,
    });
    const t = v.object({
      a: v.number().optional(),
      b: v
        .number()
        .map((n) => n + 1)
        .optional(),
    });
    expect(t.parse(o)).to.deep.equal({ a: 1, b: 3 });
  });
  it("sets cloned output's prototype to Object.prototype when data doesn't contain __proto__", () => {
    const t = v.object({ a: v.unknown().map(() => 1) });
    const r = t.parse({ a: "test" });
    expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
  });
  it("sets cloned output's prototype to Object.prototype when the data contains __proto__", () => {
    const o = Object.create(null) as Record<string, v.Type>;
    o.__proto__ = v.unknown().map(() => ({ a: 1 }));
    const t = v.object(o);
    const r = t.parse(JSON.parse('{ "__proto__": { "b": 2 } }'));
    expect(Object.getPrototypeOf(r)).toBe(Object.prototype);
  });
  it("safely sets __proto__ in a cloned output when __proto__ is transformed", () => {
    const o = Object.create(null) as Record<string, v.Type>;
    o.__proto__ = v.unknown().map(() => ({ a: 1 }));
    const t = v.object(o);
    const r = t.parse(JSON.parse('{ "__proto__": { "b": 2 } }'));
    expect(r).to.not.have.property("a");
    expect(r).to.not.have.property("b");
    expect(r).to.have.deep.own.property("__proto__", { a: 1 });
  });
  it("safely sets __proto__ in cloned output when __proto__ is transformed as a part of rest()", () => {
    const t = v.object({}).rest(v.unknown().map(() => ({ a: 1 })));
    const r = t.parse(JSON.parse('{ "__proto__": { "b": 2 } }'));
    expect(r).to.not.have.property("a");
    expect(r).to.not.have.property("b");
    expect(r).to.have.deep.own.property("__proto__", { a: 1 });
  });
  it("safely sets __proto__ in a cloned output another key is transformed", () => {
    const t = v.object({ x: v.unknown().map((x) => !x) }).rest(v.unknown());
    const r = t.parse(JSON.parse('{ "x": 1, "__proto__": { "b": 2 } }'));
    expect(r).to.not.have.property("b");
    expect(r).to.have.deep.own.property("__proto__", { b: 2 });
  });
  it("safely sets __proto__ when it's added to output (causing cloning)", () => {
    const o = Object.create(null) as Record<string, v.Type>;
    o.__proto__ = v.unknown().default({ a: 1 });
    const t = v.object(o);

    // Parse a __proto__-less object
    const r = t.parse(Object.create(null));
    expect(r).to.not.have.property("a");
    expect(r).to.have.deep.own.property("__proto__", { a: 1 });
  });
  it("safely sets __proto__ when it's added to already cloned output", () => {
    const o = Object.create(null) as Record<string, v.Type>;
    o.x = v.unknown().default(true);
    o.__proto__ = v.unknown().default({ a: 1 });
    const t = v.object(o);

    // Parse a __proto__-less object
    const r = t.parse(Object.create(null));
    expect(r).to.not.have.property("a");
    expect(r).to.have.deep.own.property("__proto__", { a: 1 });
  });
  it("sets __proto__ property as own-writable-enumerable-configurable in cloned output", () => {
    const o = Object.create(null) as Record<string, v.Type>;
    o.__proto__ = v.unknown().map(() => ({ a: 1 }));
    const t = v.object(o);
    const r = t.parse(JSON.parse('{ "__proto__": { "b": 2 } }'));
    expect(Object.getOwnPropertyDescriptor(r, "__proto__")).to.deep.equal({
      value: { a: 1 },
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });
  it("safely sets __proto__ in a cloned output when the input is cloned in the 'strip' mode", () => {
    const o = Object.create(null) as Record<string, v.Type>;
    o.__proto__ = v.unknown().map(() => ({ a: 1 }));
    const t = v.object(o);
    const r = t.parse(JSON.parse('{ "x": 1, "__proto__": { "b": 2 } }'), {
      mode: "strip",
    });
    expect(r).to.not.have.property("x");
    expect(r).to.not.have.property("a");
    expect(r).to.not.have.property("b");
    expect(r).to.have.deep.own.property("__proto__", { a: 1 });
  });
  it("rejects other types", () => {
    const t = v.object({});
    for (const val of ["1", 1n, true, null, undefined, []]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
  });
  it("checks non-enumerable required keys", () => {
    const t = v.object({ a: v.string() });
    const o = {};
    Object.defineProperty(o, "a", {
      value: 1,
      enumerable: false,
    });
    expect(() => t.parse(o))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_type",
        path: ["a"],
        expected: ["string"],
      });
  });
  it("checks non-enumerable optional keys", () => {
    const t = v.object({ a: v.string().optional() });
    const o = {};
    Object.defineProperty(o, "a", {
      value: 1,
      enumerable: false,
    });
    expect(() => t.parse(o))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_type",
        path: ["a"],
        expected: ["string"],
      });
  });
  it("fails on unrecognized keys by default", () => {
    const t = v.object({ a: v.number() });
    expect(() => t.parse({ a: 1, b: 2 }))
      .to.throw(v.ValitaError)
      .with.deep.nested.include({
        "issues[0].code": "unrecognized_keys",
        "issues[0].keys": ["b"],
      });
  });
  it("fails on unrecognized keys when mode=strict", () => {
    const t = v.object({ a: v.number() });
    expect(() => t.parse({ a: 1, b: 2 }, { mode: "strict" }))
      .to.throw(v.ValitaError)
      .with.deep.nested.include({
        "issues[0].code": "unrecognized_keys",
        "issues[0].keys": ["b"],
      });
  });
  it("reports multiple unrecognized keys when mode=strict", () => {
    const t = v.object({});
    expect(() => t.parse({ a: 1, b: 2 }, { mode: "strict" }))
      .to.throw(v.ValitaError)
      .with.deep.nested.include({
        "issues[0].code": "unrecognized_keys",
        "issues[0].keys": ["a", "b"],
      });
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
  it("strips unrecognized keys when mode=strip and there are transformed values", () => {
    const t = v.object({ a: v.number().map((x) => x + 1) });
    const o = t.parse({ a: 1, b: 2 }, { mode: "strip" });
    expect(o).to.deep.equal({ a: 2 });
  });
  it("doesn't lose optional keys when mode=strip and there unrecognized non-enumerable keys", () => {
    const o = { a: 1 } as Record<string, unknown>;
    o.b = 2;
    o.c = 3;
    const t = v.object({
      a: v.number().optional(),
      c: v.number().optional(),
    });
    expect(t.parse(o, { mode: "strip" })).to.deep.equal({ a: 1, c: 3 });
  });
  it("doesn't fail on unrecognized non-enumerable keys when mode=strict", () => {
    const o = { a: 1 };
    Object.defineProperty(o, "b", {
      value: 2,
      enumerable: false,
    });
    const t = v.object({ a: v.number(), b: v.number() });
    expect(t.parse(o, { mode: "strict" })).to.equal(o);
  });
  it("doesn't get confused by recognized non-enumerable keys when mode=strict", () => {
    const o = { x: 1 };
    Object.defineProperties(o, {
      a: {
        value: 1,
        enumerable: false,
      },
      b: {
        value: 2,
        enumerable: false,
      },
    });
    const t = v.object({ a: v.number(), b: v.number() });
    expect(() => t.parse(o, { mode: "strict" }))
      .to.throw(v.ValitaError)
      .with.deep.nested.include({
        "issues[0].code": "unrecognized_keys",
        "issues[0].keys": ["x"],
      });
  });
  it("keeps missing optionals missing when mode=strip", () => {
    const t = v.object({ a: v.number().optional() });
    const o = t.parse({ b: 2 }, { mode: "strip" });
    expect(o).to.deep.equal({});
  });
  it("doesn't consider undefined() optional when mode=strict", () => {
    const t = v.object({ a: v.undefined() });
    expect(() => t.parse({}, { mode: "strict" }))
      .to.throw(v.ValitaError)
      .with.deep.nested.include({
        "issues[0].code": "missing_value",
        "issues[0].path": ["a"],
      });
  });
  it("doesn't consider undefined() optional when mode=passthrough", () => {
    const t = v.object({ a: v.undefined() });
    expect(() => t.parse({}, { mode: "passthrough" }))
      .to.throw(v.ValitaError)
      .with.deep.nested.include({
        "issues[0].code": "missing_value",
        "issues[0].path": ["a"],
      });
  });
  it("doesn't consider undefined() optional when mode=strip", () => {
    const t = v.object({ a: v.undefined() });
    expect(() => t.parse({}, { mode: "strip" }))
      .to.throw(v.ValitaError)
      .with.deep.nested.include({
        "issues[0].code": "missing_value",
        "issues[0].path": ["a"],
      });
  });
  it("forwards parsing mode to nested types", () => {
    const t = v.object({ nested: v.object({ a: v.number() }) });
    const i = { nested: { a: 1, b: 2 } };
    expect(() => t.parse(i)).to.throw(v.ValitaError);
    expect(() => t.parse(i, { mode: "strict" })).to.throw(v.ValitaError);
    expect(t.parse(i, { mode: "passthrough" })).to.equal(i);
    expect(t.parse(i, { mode: "strip" })).to.deep.equal({ nested: { a: 1 } });
  });

  describe("omit", () => {
    it("omits given keys", () => {
      const t = v.object({ a: v.literal(1), b: v.literal(2) }).omit("b");
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: 1 }>();
      expect(t.parse({ a: 1 })).to.deep.equal({ a: 1 });
    });
    it("allows zero arguments", () => {
      const t = v.object({ a: v.literal(1), b: v.literal(2) }).omit();
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: 1; b: 2 }>();
      expect(t.parse({ a: 1, b: 2 })).to.deep.equal({ a: 1, b: 2 });
    });
    it("allows multiple", () => {
      const t = v
        .object({ a: v.literal(1), b: v.literal(2), c: v.literal(3) })
        .omit("a", "b");
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ c: 3 }>();
      expect(t.parse({ c: 3 })).to.deep.equal({ c: 3 });
    });
    it("keeps rest", () => {
      const t = v
        .object({ a: v.literal(1), b: v.literal(2) })
        .rest(v.number())
        .omit("b");
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{
        a: 1;
        [K: string]: number;
      }>();
      expect(t.parse({ a: 1, b: 1000 })).to.deep.equal({ a: 1, b: 1000 });
    });
    it("removes checks", () => {
      const t = v
        .object({ a: v.literal(1), b: v.literal(2) })
        .check(() => false)
        .omit("b");
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: 1 }>();
      expect(t.parse({ a: 1 })).to.deep.equal({ a: 1 });
    });
  });

  describe("pick", () => {
    it("omits given keys", () => {
      const t = v.object({ a: v.literal(1), b: v.literal(2) }).pick("a");
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: 1 }>();
      expect(t.parse({ a: 1 })).to.deep.equal({ a: 1 });
    });
    it("allows zero arguments", () => {
      const t = v.object({ a: v.literal(1), b: v.literal(2) }).pick();
      // eslint-disable-next-line @typescript-eslint/no-empty-object-type
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{}>();
      expect(t.parse({})).to.deep.equal({});
    });
    it("allows multiple", () => {
      const t = v
        .object({ a: v.literal(1), b: v.literal(2), c: v.literal(3) })
        .pick("a", "b");
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: 1; b: 2 }>();
      expect(t.parse({ a: 1, b: 2 })).to.deep.equal({ a: 1, b: 2 });
    });
    it("removes rest", () => {
      const t = v
        .object({ a: v.literal(1), b: v.literal(2) })
        .rest(v.string())
        .pick("a");
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: 1 }>();
      expect(() => t.parse({ a: 1, b: "test" }, { mode: "strict" })).to.throw(
        v.ValitaError,
      );
    });
    it("removes checks", () => {
      const t = v
        .object({ a: v.literal(1), b: v.literal(2) })
        .check(() => false)
        .pick("a");
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: 1 }>();
      expect(t.parse({ a: 1 })).to.deep.equal({ a: 1 });
    });
  });

  describe("partial", () => {
    it("makes all keys optional", () => {
      const t = v.object({ a: v.literal(1), b: v.literal(2) }).partial();
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<
        Partial<{ a: 1; b: 2 }>
      >();
      expect(t.parse({ a: 1 })).to.deep.equal({ a: 1 });
    });
    it("makes rest accept undefined as well as the original type", () => {
      const t = v
        .object({ a: v.literal(1) })
        .rest(v.number())
        .partial();
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<
        Partial<{ a: 1; [K: string]: number }>
      >();
      expect(t.parse({ a: 1, x: undefined, y: 1000 })).to.deep.equal({
        a: 1,
        x: undefined,
        y: 1000,
      });
    });
    it("removes checks", () => {
      const t = v
        .object({ a: v.literal(1), b: v.literal(2) })
        .check(() => false)
        .partial();
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<
        Partial<{ a: 1; b: 2 }>
      >();
      expect(t.parse({ a: 1 })).to.deep.equal({ a: 1 });
    });
  });

  describe("rest", () => {
    it("accepts extra keys", () => {
      const t = v.object({}).rest(v.unknown());
      expect(t.parse({ a: "test", b: 1 })).to.deep.equal({ a: "test", b: 1 });
    });
    it("requires the given type from defined keys", () => {
      const t = v.object({ a: v.number() }).rest(v.unknown());
      expect(() => t.parse({ a: "test", b: 1 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: ["a"],
          expected: ["number"],
        });
    });
    it("adds an index signature to the inferred type", () => {
      const _t = v.object({ a: v.literal(1) }).rest(v.number());
      expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<{
        a: 1;
        [K: string]: number;
      }>();
      expectTypeOf<v.Infer<typeof _t>>().not.toEqualTypeOf<{ a: string }>();
    });
    it("accepts matching unexpected key values", () => {
      const t = v.object({ a: v.literal("test") }).rest(v.literal(1));
      expect(t.parse({ a: "test", b: 1 })).to.deep.equal({ a: "test", b: 1 });
    });
    it("returns the original object instance if possible", () => {
      const t = v.object({ a: v.number() }).rest(v.number());
      const o = { a: 1, b: 2 };
      expect(t.parse(o)).to.equal(o);
    });
    it("returns a new object instance if the fields change", () => {
      const t = v
        .object({
          a: v.number(),
        })
        .rest(v.number().map((x) => x));
      const o = { a: 1, b: 2 };
      expect(t.parse(o)).to.not.equal(o);
    });
    it("doesn't lose the extra fields if the object has to be copied", () => {
      const t = v
        .object({
          a: v.number(),
          c: v.number().map((n) => -n),
        })
        .rest(v.number());
      const r = { a: 1, b: 2, c: 3 } as Record<string, unknown>;
      const o = Object.create(r) as Record<string, unknown>;
      o.d = 4;
      expect(t.parse(o)).to.deep.equal({ a: 1, b: 2, c: -3, d: 4 });
    });

    it("ignores non-enumerable keys", () => {
      const t = v.object({ a: v.literal("test") }).rest(v.literal(1));
      const o = { a: "test" };
      Object.defineProperty(o, "b", {
        value: "string",
        enumerable: false,
      });
      expect(t.parse(o)).to.deep.equal({ a: "test" });
    });
    it("rejects non-matching unexpected key values", () => {
      const t = v.object({ a: v.literal("test") }).rest(v.literal(1));
      expect(() => t.parse({ a: "test", b: 2 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues")
        .with.lengthOf(1)
        .that.deep.includes({
          code: "invalid_literal",
          path: ["b"],
          expected: [1],
        });
    });
    it("applies only to unexpected keys", () => {
      const t = v.object({ a: v.literal("test") }).rest(v.literal(1));
      expect(() => t.parse({ a: 1 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues")
        .with.lengthOf(1)
        .that.deep.includes({
          code: "invalid_literal",
          path: ["a"],
          expected: ["test"],
        });
    });
    it("takes precedence over mode=strict", () => {
      const t = v.object({}).rest(v.literal(1));
      expect(t.parse({ a: 1 }, { mode: "strict" })).to.deep.equal({ a: 1 });
      expect(() => t.parse({ a: 2 }, { mode: "strict" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues")
        .with.lengthOf(1)
        .that.deep.includes({
          code: "invalid_literal",
          path: ["a"],
          expected: [1],
        });
    });
    it("takes precedence over mode=strip", () => {
      const t = v.object({}).rest(v.literal(1));
      expect(t.parse({ a: 1 }, { mode: "strip" })).to.deep.equal({ a: 1 });
      expect(() => t.parse({ a: 2 }, { mode: "strip" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues")
        .with.lengthOf(1)
        .that.deep.includes({
          code: "invalid_literal",
          path: ["a"],
          expected: [1],
        });
    });
    it("takes precedence over mode=passthrough", () => {
      const t = v.object({}).rest(v.literal(1));
      expect(t.parse({ a: 1 }, { mode: "passthrough" })).to.deep.equal({
        a: 1,
      });
      expect(() => t.parse({ a: 2 }, { mode: "passthrough" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues")
        .with.lengthOf(1)
        .that.deep.includes({
          code: "invalid_literal",
          path: ["a"],
          expected: [1],
        });
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
  describe("extend()", () => {
    it("extends the base shape", () => {
      const t = v.object({ a: v.string() }).extend({ b: v.number() });
      expect(t.parse({ a: "test", b: 1 })).to.deep.equal({ a: "test", b: 1 });
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{
        a: string;
        b: number;
      }>();
    });
    it("overwrites already existing keys", () => {
      const t = v.object({ a: v.string() }).extend({ a: v.number() });
      expect(t.parse({ a: 1 })).to.deep.equal({ a: 1 });
      expect(() => t.parse({ a: "test" })).to.throw(v.ValitaError);
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: number }>();
    });
  });
  describe("check()", () => {
    it("accepts a function returning boolean", () => {
      const t = v.object({ a: v.string() }).check((_v) => true);
      expect(t.parse({ a: "test" })).to.deep.equal({ a: "test" });
    });
    it("doesn't affect the base shape", () => {
      const _t = v.object({ a: v.string() }).check((v): boolean => Boolean(v));
      expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<{ a: string }>();
    });
    it("skips all checks if any property fails to parse", () => {
      let didRun = false;
      const t = v.object({ a: v.string(), b: v.number() }).check(() => {
        didRun = true;
        return true;
      });
      expect(() => t.parse({ a: "test" })).to.throw(v.ValitaError);
      expect(didRun).toBe(false);
    });
    it("runs multiple checks in order", () => {
      const t = v
        .object({ a: v.string() })
        .check((v) => v.a === "test", "first")
        .check(() => false, "second");
      expect(() => t.parse({ a: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "second",
        });
      expect(() => t.parse({ a: "other" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "first",
        });
    });
    it("runs checks after the object has otherwise been parsed", () => {
      const t = v
        .object({ a: v.string() })
        .check((v) => (v as Record<string, unknown>).b === 2)
        .extend({ b: v.undefined().map(() => 2) })
        .check((v) => v.b === 2);
      expect(() => t.parse({ a: "test", b: null }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: ["b"],
        });
      expect(t.parse({ a: "test", b: undefined })).to.deep.equal({
        a: "test",
        b: 2,
      });
    });
    it("allows extending the base type after adding checks", () => {
      const t = v
        .object({ a: v.string() })
        .check((v): boolean => Boolean(v))
        .extend({ b: v.number() });
      expect(t.parse({ a: "test", b: 1 })).to.deep.equal({ a: "test", b: 1 });
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{
        a: string;
        b: number;
      }>();
    });
    it("creates a custom error on failure", () => {
      const t = v.object({ a: v.string() }).check(() => false);
      expect(() => t.parse({ a: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.includes({ code: "custom_error" });
    });
    it("allows passing in a custom error message", () => {
      const t = v.object({ a: v.string() }).check(() => false, "test");
      expect(() => t.parse({ a: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "test",
        });
    });
    it("allows passing in a custom error message in an object", () => {
      const t = v
        .object({ a: v.string() })
        .check(() => false, { message: "test" });
      expect(() => t.parse({ a: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: { message: "test" },
        });
    });
    it("allows passing in a error path", () => {
      const t = v
        .object({ a: v.string() })
        .check(() => false, { path: ["test"] });
      expect(() => t.parse({ a: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          path: ["test"],
        });
    });
  });
});
