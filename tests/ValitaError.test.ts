import { describe, it, expect } from "vitest";
import * as v from "../src";

describe("ValitaError", () => {
  const error = new v.ValitaError({
    ok: false,
    code: "invalid_type",
    expected: ["bigint"],
  });
  it("is derived from Error", () => {
    expect(error).to.be.instanceof(Error);
  });
  it("has a name", () => {
    expect(error.name).to.equal("ValitaError");
  });
  describe("issues", () => {
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
        ok: false,
        code: "join",
        left: {
          ok: false,
          code: "invalid_type",
          expected: ["bigint"],
        },
        right: {
          ok: false,
          code: "prepend",
          key: "first",
          tree: {
            ok: false,
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
  describe("message", () => {
    it("describes the issue when there's only one issue", () => {
      const t = v.bigint();
      expect(() => t.parse("test")).throws(
        v.ValitaError,
        "invalid_type at . (expected bigint)",
      );
    });
    it("describes the leftmost issue when there are two issues", () => {
      const t = v.tuple([v.bigint(), v.string()]);
      expect(() => t.parse(["test", 1])).throws(
        v.ValitaError,
        "invalid_type at .0 (expected bigint) (+ 1 other issue)",
      );
    });
    it("describes the leftmost issue when there are more than two issues", () => {
      const t = v.tuple([v.bigint(), v.string(), v.number()]);
      expect(() => t.parse(["test", 1, "other"])).throws(
        v.ValitaError,
        "invalid_type at .0 (expected bigint) (+ 2 other issues)",
      );
    });
    it("uses description 'validation failed' by default for custom_error", () => {
      const t = v.unknown().chain(() => v.err());
      expect(() => t.parse(1)).throws(
        v.ValitaError,
        "custom_error at . (validation failed)",
      );
    });
    it("takes the custom_error description from the given value when given as string", () => {
      const t = v.unknown().chain(() => v.err("test"));
      expect(() => t.parse(1)).throws(
        v.ValitaError,
        "custom_error at . (test)",
      );
    });
    it("takes the custom_error description from the .message property when given in an object", () => {
      const t = v.unknown().chain(() => v.err({ message: "test" }));
      expect(() => t.parse(1)).throws(
        v.ValitaError,
        "custom_error at . (test)",
      );
    });
    it("includes to custom_error path the .path property when given in an object", () => {
      const t = v.object({
        a: v.unknown().chain(() => v.err({ message: "test", path: [1, "b"] })),
      });
      expect(() => t.parse({ a: 1 })).throws(
        v.ValitaError,
        "custom_error at .a.1.b (test)",
      );
    });
  });
});
