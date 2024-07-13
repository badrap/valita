import { describe, it, expect } from "vitest";
import * as v from "../src";

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
