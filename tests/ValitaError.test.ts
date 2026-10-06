import { describe, it, expect } from "vitest";
import * as v from "../src/index.ts";

function catchValitaError(fn: () => unknown): v.ValitaError {
  try {
    fn();
  } catch (err) {
    if (err instanceof v.ValitaError) {
      return err;
    }
    throw err;
  }
  expect.unreachable();
}

describe("ValitaError", () => {
  const error = catchValitaError(() => v.bigint().parse(null));

  it("is derived from Error", () => {
    expect(error).to.be.instanceof(Error);
  });

  it("has a name", () => {
    expect(error.name).to.equal("ValitaError");
  });

  describe("issues", () => {
    it("lists issues", () => {
      expect(error.issues).toEqual([
        {
          path: [],
          message: "expected bigint",
          code: "invalid_type",
          expected: ["bigint"],
        },
      ]);
    });

    it("supports multiple issues", () => {
      const error = catchValitaError(() => {
        v.object({
          first: v.bigint(),
          second: v.string(),
        }).parse({
          first: null,
          second: null,
        });
      });
      expect(error.issues).toEqual([
        {
          path: ["first"],
          message: "expected bigint",
          code: "invalid_type",
          expected: ["bigint"],
        },
        {
          path: ["second"],
          message: "expected string",
          code: "invalid_type",
          expected: ["string"],
        },
      ]);
    });

    it("caches the issues list", () => {
      expect(error.issues).to.equal(error.issues);
    });

    it("appends custom error paths to the issue", () => {
      expect(() =>
        v
          .object({
            foo: v.unknown().chain(() => v.err({ path: [0, "bar"] })),
          })
          .chain(() => v.err())
          .parse({ foo: 1 }),
      ).toThrow(
        expect.objectContaining({
          issues: [
            expect.objectContaining({
              code: "custom_error",
              path: ["foo", 0, "bar"],
              message: "validation failed",
            }),
          ],
        }),
      );
    });

    it("normalizes custom errors", () => {
      expect(() =>
        v
          .unknown()
          .chain(() => v.err())
          .parse(1),
      ).toThrow(
        expect.objectContaining({
          issues: [
            expect.objectContaining({
              code: "custom_error",
              path: [],
              message: "validation failed",
            }),
          ],
        }),
      );

      expect(() =>
        v
          .unknown()
          .chain(() => v.err({ path: ["foo"] }))
          .parse(1),
      ).toThrow(
        expect.objectContaining({
          issues: [
            expect.objectContaining({
              code: "custom_error",
              path: ["foo"],
              message: "validation failed",
            }),
          ],
        }),
      );

      expect(() =>
        v
          .unknown()
          .chain(() => v.err({ message: "test", path: ["bar"] }))
          .parse(1),
      ).toThrow(
        expect.objectContaining({
          issues: [
            expect.objectContaining({
              code: "custom_error",
              path: ["bar"],
              message: "test",
            }),
          ],
        }),
      );

      expect(() =>
        v
          .unknown()
          .chain(() => v.err({ message: "test" }))
          .parse(1),
      ).toThrow(
        expect.objectContaining({
          issues: [
            expect.objectContaining({
              code: "custom_error",
              path: [],
              message: "test",
            }),
          ],
        }),
      );

      expect(() =>
        v
          .unknown()
          .chain(() => v.err("test"))
          .parse(1),
      ).toThrow(
        expect.objectContaining({
          issues: [
            expect.objectContaining({
              code: "custom_error",
              path: [],
              message: "test",
            }),
          ],
        }),
      );
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
