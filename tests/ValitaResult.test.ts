import { describe, it, expect, assert } from "vitest";
import * as v from "../src/index.ts";

describe("ValitaResult", () => {
  describe("Ok", () => {
    describe("value", () => {
      it("contains the input value when there are no transforms", () => {
        const o = {};
        const r = v.unknown().try(o);
        assert(r.ok);
        expect(r.value).toBe(o);
      });

      it("is the modified value when there are transforms", () => {
        const o = {};
        const r = v
          .unknown()
          .map(() => 1)
          .try(o);
        assert(r.ok);
        expect(r.value).toBe(1);
      });
    });

    describe("issues", () => {
      it("is undefined", () => {
        const result = v.string().try("test");
        expect(result.issues).toBeUndefined();
      });

      it("is an inherited property", () => {
        const result = v.string().try("test");
        expect("issues" in result).toBe(true);
        expect(Object.hasOwn(result, "issues")).toBe(false);
      });
    });
  });

  describe("Err", () => {
    describe("issues", () => {
      it("lists issues", () => {
        expect(v.bigint().try("test")).toMatchObject({
          issues: [
            {
              path: [],
              message: "expected bigint",
              code: "invalid_type",
              expected: ["bigint"],
            },
          ],
        });
      });

      it("supports multiple issues", () => {
        expect(
          v.object({ a: v.bigint(), b: v.string() }).try({ a: "test", b: 1 }),
        ).toMatchObject({
          issues: [
            {
              path: ["a"],
              message: "expected bigint",
              code: "invalid_type",
              expected: ["bigint"],
            },
            {
              path: ["b"],
              message: "expected string",
              code: "invalid_type",
              expected: ["string"],
            },
          ],
        });
      });

      it("caches the issues list", () => {
        const result = v.bigint().try("test");
        expect(!result.ok && result.issues).to.equal(
          !result.ok && result.issues,
        );
      });

      it("appends custom error paths to the issue", () => {
        expect(
          v
            .object({
              foo: v.unknown().chain(() => v.err({ path: [0, "bar"] })),
            })
            .chain(() => v.err())
            .try({ foo: 1 }),
        ).toMatchObject({
          issues: [
            {
              path: ["foo", 0, "bar"],
              message: "validation failed",
              code: "custom_error",
            },
          ],
        });
      });

      it("normalizes custom errors", () => {
        expect(
          v
            .unknown()
            .chain(() => v.err())
            .try(1),
        ).toMatchObject({
          issues: [
            {
              path: [],
              message: "validation failed",
              code: "custom_error",
            },
          ],
        });

        expect(
          v
            .unknown()
            .chain(() => v.err({ path: ["foo"] }))
            .try(1),
        ).toMatchObject({
          issues: [
            {
              path: ["foo"],
              message: "validation failed",
              code: "custom_error",
            },
          ],
        });

        expect(
          v
            .unknown()
            .chain(() => v.err({ message: "test", path: ["bar"] }))
            .try(1),
        ).toMatchObject({
          issues: [
            {
              path: ["bar"],
              message: "test",
              code: "custom_error",
            },
          ],
        });

        expect(
          v
            .unknown()
            .chain(() => v.err({ message: "test" }))
            .try(1),
        ).toMatchObject({
          issues: [
            {
              path: [],
              message: "test",
              code: "custom_error",
            },
          ],
        });

        expect(
          v
            .unknown()
            .chain(() => v.err("test"))
            .try(1),
        ).toMatchObject({
          issues: [
            {
              path: [],
              message: "test",
              code: "custom_error",
            },
          ],
        });
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
        expect(!result.ok && result.message).to.equal(
          "custom_error at . (test)",
        );
      });

      it("takes the custom_error description from the .message property when given in an object", () => {
        const result = v
          .unknown()
          .chain(() => v.err({ message: "test" }))
          .try(1);
        expect(!result.ok && result.message).to.equal(
          "custom_error at . (test)",
        );
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
});
