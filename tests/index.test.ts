import { expect } from "chai";
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
      a: v.number().transform((n) => ({ ok: true, value: "" + n })),
    });
    const o = { a: 1 };
    expect(t.parse(o)).to.not.equal(o);
  });
  it("rejects other types", () => {
    const t = v.object({}).passthrough();
    for (const val of ["1", 1n, true, null, undefined, []]) {
      expect(() => t.parse(val)).to.throw(v.ValitaError);
    }
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
    const t = v.array(
      v.number().transform((n) => ({ ok: true, value: "" + n }))
    );
    const a = [1];
    expect(t.parse(a)).to.not.equal(a);
  });
});

describe("ValitaError", () => {
  const error = new v.ValitaError({
    ok: false,
    type: "error",
    code: "invalid_type",
    message: "test",
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
        message: "test",
      },
    ]);
  });
  it("supports multiple issues", () => {
    const error = new v.ValitaError({
      ok: false,
      type: "path",
      value: "first",
      current: {
        ok: false,
        code: "invalid_type",
        type: "error",
        message: "test1",
      },
      next: {
        ok: false,
        code: "invalid_type",
        type: "error",
        message: "test2",
      },
    });
    expect(error.issues).to.deep.equal([
      {
        path: [],
        code: "invalid_type",
        message: "test2",
      },
      {
        path: ["first"],
        code: "invalid_type",
        message: "test1",
      },
    ]);
  });
  it("caches the issues list", () => {
    expect(error.issues).to.equal(error.issues);
  });
});
