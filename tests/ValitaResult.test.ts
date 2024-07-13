import { describe, it, expect } from "vitest";
import * as v from "../src";

describe("ValitaResult", () => {
  describe("issues", () => {
    it("lists issues", () => {
      const result = v.bigint().try("test");
      expect(!result.ok && result.issues).to.deep.equal([
        {
          path: [],
          code: "invalid_type",
          expected: ["bigint"],
        },
      ]);
    });
    it("supports multiple issues", () => {
      const result = v
        .object({ a: v.bigint(), b: v.string() })
        .try({ a: "test", b: 1 });
      expect(!result.ok && result.issues).to.have.deep.members([
        {
          path: ["a"],
          code: "invalid_type",
          expected: ["bigint"],
        },
        {
          path: ["b"],
          code: "invalid_type",
          expected: ["string"],
        },
      ]);
    });
    it("caches the issues list", () => {
      const result = v.bigint().try("test");
      expect(!result.ok && result.issues).to.equal(!result.ok && result.issues);
    });
  });
  describe("message", () => {
    it("describes the issue when there's only one issue", () => {
      const result = v.bigint().try("test");
      expect(!result.ok && result.message).to.equal(
        "invalid_type at . (expected bigint)",
      );
    });
    it("describes the leftmost issue when there are two issues", () => {
      const result = v.tuple([v.bigint(), v.string()]).try(["test", 1]);
      expect(!result.ok && result.message).to.equal(
        "invalid_type at .0 (expected bigint) (+ 1 other issue)",
      );
    });
    it("describes the leftmost issue when there are more than two issues", () => {
      const result = v
        .tuple([v.bigint(), v.string(), v.number()])
        .try(["test", 1, "other"]);
      expect(!result.ok && result.message).to.equal(
        "invalid_type at .0 (expected bigint) (+ 2 other issues)",
      );
    });
    it("uses description 'validation failed' by default for custom_error", () => {
      const result = v
        .unknown()
        .chain(() => v.err())
        .try(1);
      expect(!result.ok && result.message).to.equal(
        "custom_error at . (validation failed)",
      );
    });
    it("takes the custom_error description from the given value when given as string", () => {
      const result = v
        .unknown()
        .chain(() => v.err("test"))
        .try(1);
      expect(!result.ok && result.message).to.equal("custom_error at . (test)");
    });
    it("takes the custom_error description from the .message property when given in an object", () => {
      const result = v
        .unknown()
        .chain(() => v.err({ message: "test" }))
        .try(1);
      expect(!result.ok && result.message).to.equal("custom_error at . (test)");
    });
    it("includes to custom_error path the .path property when given in an object", () => {
      const result = v
        .object({
          a: v
            .unknown()
            .chain(() => v.err({ message: "test", path: [1, "b"] })),
        })
        .try({ a: 1 });
      expect(!result.ok && result.message).to.equal(
        "custom_error at .a.1.b (test)",
      );
    });
  });
  describe("throw", () => {
    it("throws a corresponding ValitaError", () => {
      const result = v.bigint().try("test");
      expect(() => !result.ok && result.throw())
        .to.throw(v.ValitaError)
        .with.deep.property("issues", !result.ok && result.issues);
    });
  });
});
