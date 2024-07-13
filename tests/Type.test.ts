import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("Type", () => {
  it("is not assignable from Optional", () => {
    expectTypeOf(v.unknown().optional()).not.toMatchTypeOf<v.Type>();
  });
  it("is not assignable to Optional", () => {
    expectTypeOf(v.unknown()).not.toMatchTypeOf<v.Optional>();
  });

  describe("try", () => {
    it("returns ValitaResult<T> when called for v.Type<T>", () => {
      function _<T>(type: v.Type<T>, value: unknown): v.ValitaResult<T> {
        return type.try(value);
      }
    });
    it("returns type v.ValitaResult<v.Infer<...>>", () => {
      function _<T extends v.Type>(
        type: T,
        value: unknown,
      ): v.ValitaResult<v.Infer<T>> {
        return type.try(value);
      }
    });
    it("returns type discriminated by .ok", () => {
      const result = v.number().try(1);
      if (result.ok) {
        expectTypeOf(result).toMatchTypeOf<{ value: number }>();
        expectTypeOf(result).not.toMatchTypeOf<{ message: string }>();
      } else {
        expectTypeOf(result).not.toMatchTypeOf<{ value: number }>();
        expectTypeOf(result).toMatchTypeOf<{ message: string }>();
      }
    });
    it("returns { ok: true, value: ... } on success", () => {
      const result = v.number().try(1);
      expect(result.ok).to.equal(true);
      expect(result.ok && result.value).to.equal(1);
    });
    it("keeps the original instance for .value when possible", () => {
      const o = {};
      const t = v.object({});
      const result = t.try(o);
      expect(result.ok && result.value).to.equal(o);
    });
    it("creates a new instance for .value when necessary", () => {
      const o = { a: 1 };
      const t = v.object({});
      const result = t.try(o, { mode: "strip" });
      expect(result.ok && result.value).to.not.equal(o);
    });
    it("returns { ok: false, ... } on failure", () => {
      const t = v.number();
      const result = t.try("test");
      expect(result.ok).to.equal(false);
    });
  });
  describe("parse", () => {
    it("returns T when called for v.Type<T>", () => {
      function _<T>(type: v.Type<T>, value: unknown): T {
        return type.parse(value);
      }
    });
    it("returns type v.Infer<...>", () => {
      function _<T extends v.Type>(type: T, value: unknown): v.Infer<T> {
        return type.parse(value);
      }
    });
  });
  describe("assert", () => {
    it("passes the type through by default", () => {
      const t = v.number().assert(() => true);
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<number>();
    });
    it("turns optional input into non-optional output", () => {
      const t = v.object({
        a: v
          .number()
          .optional()
          .assert(() => true),
      });
      expect(t.parse({})).to.deep.equal({ a: undefined });
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{
        a: number | undefined;
      }>();
    });
    it("accepts type predicates", () => {
      type Branded = number & { readonly brand: unique symbol };
      const t = v.number().assert((n): n is Branded => true);
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<Branded>();
      expectTypeOf<v.Infer<typeof t>>().not.toEqualTypeOf<number>();
    });
    it("accepts type parameters", () => {
      const t = v.number().assert<1>((n) => n === 1);
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<1>();
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
    it("passes in normalized parse options", () => {
      let options: unknown;
      const t = v.number().assert((n, opts) => {
        options = opts;
        return true;
      });
      t.parse(1, { mode: "strict" });
      expect(options).to.deep.equal({ mode: "strict" });
      t.parse(1, { mode: "strip" });
      expect(options).to.deep.equal({ mode: "strip" });
      t.parse(1, { mode: "passthrough" });
      expect(options).to.deep.equal({ mode: "passthrough" });
      t.parse(1, { mode: "strict" });
      expect(options).to.deep.equal({ mode: "strict" });
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
    it("runs multiple asserts in order", () => {
      const t = v
        .string()
        .assert((s) => s !== "a", "a")
        .assert(() => false, "b");
      expect(() => t.parse("a"))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "a",
        });
      expect(() => t.parse("b"))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "custom_error",
          error: "b",
        });
    });
    it("always gets the value transformed by previous maps and chains", () => {
      const x = {};
      const t = v
        .string()
        .assert((s) => s === "a")
        .map(() => x)
        .assert((s) => s === x);
      expect(t.parse("a")).to.equal(x);
    });
  });
  describe("map", () => {
    it("changes the output type to the function's return type", () => {
      const t = v.number().map(String);
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<string>();
    });
    it("infers literals when possible", () => {
      const t = v.number().map(() => "test");
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<"test">();
    });
    it("passes in the parsed value", () => {
      let value: unknown;
      const t = v.number().map((v) => (value = v));
      t.parse(1000);
      expect(value).to.equal(1000);
    });
    it("passes in normalized parse options", () => {
      let options: unknown;
      const t = v.number().map((n, opts) => {
        options = opts;
      });
      t.parse(1, { mode: "strict" });
      expect(options).to.deep.equal({ mode: "strict" });
      t.parse(1, { mode: "strip" });
      expect(options).to.deep.equal({ mode: "strip" });
      t.parse(1, { mode: "passthrough" });
      expect(options).to.deep.equal({ mode: "passthrough" });
      t.parse(1, { mode: "strict" });
      expect(options).to.deep.equal({ mode: "strict" });
    });
    it("passes on the return value", () => {
      const t = v.number().map(() => "test");
      expect(t.parse(1000)).to.equal("test");
    });
    it("runs multiple maps in order", () => {
      const t = v
        .string()
        .map((s) => s + "b")
        .map((s) => s + "c");
      expect(t.parse("a")).to.equal("abc");
    });
  });
  describe("chain", () => {
    it("changes the output type to the function's return type", () => {
      const t = v.number().chain((n) => v.ok(String(n)));
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<string>();
    });
    it("infers literals when possible", () => {
      const t = v.number().chain(() => ({ ok: true, value: "test" }));
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<"test">();
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
    it("passes in normalized parse options", () => {
      let options: unknown;
      const t = v.number().chain((n, opts) => {
        options = opts;
        return v.ok("test");
      });
      t.parse(1, { mode: "strict" });
      expect(options).to.deep.equal({ mode: "strict" });
      t.parse(1, { mode: "strip" });
      expect(options).to.deep.equal({ mode: "strip" });
      t.parse(1, { mode: "passthrough" });
      expect(options).to.deep.equal({ mode: "passthrough" });
      t.parse(1, { mode: "strict" });
      expect(options).to.deep.equal({ mode: "strict" });
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
    it("runs multiple chains in order", () => {
      const t = v
        .string()
        .chain((s) => v.ok(s + "b"))
        .chain((s) => v.ok(s + "c"));
      expect(t.parse("a")).to.equal("abc");
    });
    it("works together with .try()", () => {
      const s = v.string();
      const t = v.unknown().chain((x) => s.try(x));
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<string>();
      expect(t.parse("a")).to.equal("a");
      expect(() => t.parse(1)).to.throw(v.ValitaError);
    });
  });
  describe("optional()", () => {
    it("returns an Optional", () => {
      expectTypeOf(v.unknown().optional()).toMatchTypeOf<v.Optional>();
      expectTypeOf(v.unknown().optional()).not.toMatchTypeOf<v.Type>();
    });
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
        a: v.string().optional(),
      });
      expect(t.parse({ a: "test" })).to.deep.equal({ a: "test" });
    });
    it("adds undefined to output", () => {
      const t = v.string().optional();
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<string | undefined>();
    });
    it("makes the output type optional", () => {
      const t = v.object({ a: v.number().optional() });
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{
        a?: number | undefined;
      }>();
    });
    it("short-circuits previous optionals", () => {
      const t = v.object({
        a: v
          .string()
          .optional()
          .map(() => 1)
          .optional(),
      });
      expect(t.parse({ a: undefined })).to.deep.equal({ a: undefined });
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a?: 1 | undefined }>();
    });
    it("short-circuits undefined()", () => {
      const t = v.object({
        a: v
          .undefined()
          .map(() => 1)
          .optional(),
      });
      expect(t.parse({ a: undefined })).to.deep.equal({ a: undefined });
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a?: 1 | undefined }>();
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
  describe("nullable()", () => {
    it("accepts null", () => {
      const t = v.object({
        a: v.string().nullable(),
      });
      expect(t.parse({ a: null })).to.deep.equal({ a: null });
    });
    it("accepts the original type", () => {
      const t = v.object({
        a: v.string().nullable(),
      });
      expect(t.parse({ a: "test" })).to.deep.equal({ a: "test" });
    });
    it("adds null to output", () => {
      const t = v.string().nullable();
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<string | null>();
    });
    it("makes the output type nullable", () => {
      const t = v.object({ a: v.number().nullable() });
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: number | null }>();
    });
    it("short-circuits previous nulls", () => {
      const t = v.object({
        a: v
          .string()
          .nullable()
          .map(() => 1)
          .nullable(),
      });
      expect(t.parse({ a: null })).to.deep.equal({ a: null });
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: 1 | null }>();
    });
    it("short-circuits null()", () => {
      const t = v.object({
        a: v
          .null()
          .map(() => 1)
          .nullable(),
      });
      expect(t.parse({ a: null })).to.deep.equal({ a: null });
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ a: 1 | null }>();
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
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<2>();
    });
    it("removes undefined from the return type", () => {
      const t = v.union(v.string(), v.undefined()).default(2);
      expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<string | 2>();
    });
  });
});
