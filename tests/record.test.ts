import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("record()", () => {
  it("acceps empty objects", () => {
    const t = v.record(v.unknown());
    expect(t.parse({})).to.deep.equal({});
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ [K: string]: unknown }>();
  });
  it("does not accept arrays", () => {
    const t = v.record(v.unknown());
    expect(() => t.parse([])).to.throw(v.ValitaError);
  });
  it("acceps the defined types of values", () => {
    const t = v.record(v.number());
    expect(t.parse({ a: 1 })).to.deep.equal({ a: 1 });
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ [K: string]: number }>();
  });
  it("defaults to Record<string, unknown>", () => {
    const t = v.record();
    expect(t.parse({ a: 1 })).to.deep.equal({ a: 1 });
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<{ [K: string]: unknown }>();
  });
  it("rejects values other than the defined type", () => {
    const t = v.record(v.number());
    expect(() => t.parse({ a: "test" })).to.throw(v.ValitaError);
  });
  it("does not react to parsing modes", () => {
    const t = v.record(v.number());
    expect(t.parse({ a: 1 }, { mode: "strict" })).to.deep.equal({ a: 1 });
    expect(() => t.parse({ a: 1, b: "test" }, { mode: "strict" })).to.throw(
      v.ValitaError,
    );
    expect(t.parse({ a: 1 }, { mode: "strip" })).to.deep.equal({ a: 1 });
    expect(() => t.parse({ a: 1, b: "test" }, { mode: "strip" })).to.throw(
      v.ValitaError,
    );
    expect(() =>
      t.parse({ a: 1, b: "test" }, { mode: "passthrough" }),
    ).to.throw(v.ValitaError);
  });
  it("safely sets __proto__ in cloned output when values are transformed", () => {
    const t = v.record(v.unknown().map(() => ({ a: 1 })));
    const r = t.parse(JSON.parse('{ "__proto__": { "b": 2 } }'));
    expect(r).to.not.have.property("a");
    expect(r).to.not.have.property("b");
    expect(r).to.have.deep.own.property("__proto__", { a: 1 });
  });
  it("sets __proto__ property as own-writable-enumerable-configurable in cloned output", () => {
    const t = v.record(v.unknown().map(() => ({ a: 1 })));
    const r = t.parse(JSON.parse('{ "__proto__": { "b": 2 } }'));
    expect(Object.getOwnPropertyDescriptor(r, "__proto__")).to.deep.equal({
      value: { a: 1 },
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });
});
