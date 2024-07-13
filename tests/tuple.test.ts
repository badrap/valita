import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("tuple()", () => {
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
  it("throws on length mismatch", () => {
    const t = v.tuple([v.number()]);
    expect(() => t.parse([1, 1]))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_length",
        path: [],
        minLength: 1,
        maxLength: 1,
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
