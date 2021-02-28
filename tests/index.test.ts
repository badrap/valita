import { expect } from "chai";
import * as v from "../src";

describe("string()", () => {
  it("accepts strings", () => {
    const t = v.string();
    expect(t.parse("test")).to.equal("test");
  });
  it("rejects non-strings", () => {
    const t = v.string();
    expect(() => t.parse({})).to.throw(v.ValitaError);
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
