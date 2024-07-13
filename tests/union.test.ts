import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("union()", () => {
  it("accepts two subvalidators", () => {
    const t = v.union(v.string(), v.number());
    expect(t.parse("test")).to.equal("test");
    expect(t.parse(1)).to.equal(1);
    expect(() => t.parse({})).to.throw(v.ValitaError);
  });
  it("ignores never()", () => {
    const t = v.union(v.string(), v.never());
    expect(t.parse("test")).to.equal("test");
    expect(() => t.parse(1)).to.throw(v.ValitaError);
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<string>();
  });
  it("picks the first successful parse", () => {
    const t = v.union(
      v
        .string()
        .map(() => 1)
        .assert(() => false),
      v.string().map(() => 2),
    );
    expect(t.parse("test")).to.equal(2);
  });
  it("respects the order of overlapping parsers", () => {
    const a = v.literal(1).map(() => "literal");
    const b = v.number().map(() => "number");
    const c = v.unknown().map(() => "unknown");
    expect(v.union(a, b, c).parse(1)).to.equal("literal");
    expect(v.union(a, c, b).parse(1)).to.equal("literal");
    expect(v.union(b, a, c).parse(1)).to.equal("number");
    expect(v.union(b, c, a).parse(1)).to.equal("number");
    expect(v.union(c, b, a).parse(1)).to.equal("unknown");
    expect(v.union(c, a, b).parse(1)).to.equal("unknown");
  });
  it("deduplicates strictly equal parsers", () => {
    const a = v.unknown().assert(() => false, "test");
    expect(() => v.union(a, a).parse(1))
      .to.throw(v.ValitaError)
      .with.property("issues")
      .with.lengthOf(1);
  });
  it("keeps the matching order when deduplicating", () => {
    const a = v.unknown().map(() => "a");
    const b = v.unknown().map(() => "b");
    expect(v.union(a, b, a).parse(1)).to.equal("a");
  });
  it("accepts more than two subvalidators", () => {
    const t = v.union(
      v.string(),
      v.number(),
      v.null(),
      v.undefined(),
      v.boolean(),
    );
    expect(t.parse("test")).to.equal("test");
    expect(t.parse(1)).to.equal(1);
    expect(t.parse(null)).to.equal(null);
    expect(t.parse(undefined)).to.equal(undefined);
    expect(t.parse(true)).to.equal(true);
    expect(() => t.parse({})).to.throw(v.ValitaError);
  });
  it("accepts optional input if it maps to non-optional output", () => {
    const t = v.object({
      a: v.union(
        v.undefined(),
        v
          .unknown()
          .optional()
          .map(() => 1),
      ),
    });
    expect(t.parse({})).toEqual({ a: 1 });
  });
  it("reports the expected type even for literals when the base type doesn't match", () => {
    const t = v.union(v.literal(1), v.literal("test"));
    expect(() => t.parse(true))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_literal",
        expected: [1, "test"],
      });
  });
  it("reports the expected literals when the base type matches", () => {
    const t = v.union(v.literal(1), v.literal("test"));
    expect(() => t.parse(2))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_literal",
        expected: [1, "test"],
      });
  });
  it("reports the errors from a branch that doesn't overlap with any other branch", () => {
    const t = v.union(v.literal(1), v.number(), v.object({ a: v.number() }));
    expect(() => t.parse({ a: "test" }))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_type",
        path: ["a"],
        expected: ["number"],
      });
  });
  it("reports expected types in the order they were first listed", () => {
    const t1 = v.union(v.literal(2), v.string(), v.literal(2));
    expect(() => t1.parse(true))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_type",
        path: [],
        expected: ["number", "string"],
      });

    const t2 = v.union(v.string(), v.literal(2), v.string());
    expect(() => t2.parse(true))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_type",
        path: [],
        expected: ["string", "number"],
      });
  });
  it("reports expected literals in the order they were first listed", () => {
    const t1 = v.union(v.literal(2), v.literal(1), v.literal(2));
    expect(() => t1.parse(3))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_literal",
        path: [],
        expected: [2, 1],
      });

    const t2 = v.union(v.literal(1), v.literal(2), v.literal(1));
    expect(() => t2.parse(3))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_literal",
        path: [],
        expected: [1, 2],
      });
  });
  it("matches unknowns if nothing else matches", () => {
    const t = v.union(
      v.literal(1),
      v.literal(2),
      v.unknown().assert(() => false, "test"),
    );
    expect(() => t.parse({ a: 1 }))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "custom_error",
        error: "test",
      });
  });
  it("considers never() to not overlap with anything", () => {
    const t = v.union(
      v.never(),
      v.unknown().assert(() => false, "unknown"),
    );
    expect(() => t.parse(2))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "custom_error",
        error: "unknown",
      });
  });
  it("considers unknown() to overlap with everything except never()", () => {
    const t = v.union(
      v.literal(1),
      v.literal(2).assert(() => false),
      v.unknown().assert(() => false),
    );
    expect(() => t.parse(2))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_union",
      });
  });
  it("considers unknown() to overlap with objects", () => {
    const t = v.union(
      v.unknown(),
      v.object({ type: v.literal("a") }),
      v.object({ type: v.literal("b") }),
    );
    expect(t.parse({ type: "c" })).to.deep.equal({ type: "c" });
  });
  it("considers array() and tuple() to overlap", () => {
    const t = v.union(v.array(v.number()), v.tuple([v.string()]));
    expect(() => t.parse(2))
      .to.throw(v.ValitaError)
      .with.nested.property("issues[0]")
      .that.deep.includes({
        code: "invalid_type",
        expected: ["array"],
      });
  });
  it("keeps transformed values", () => {
    const t = v.union(
      v.literal("test1").map(() => 1),
      v.literal("test2").map(() => 2),
    );
    expect(t.parse("test1")).to.deep.equal(1);
  });
  describe("of objects", () => {
    it("discriminates based on base types", () => {
      const t = v.union(
        v.object({ type: v.number() }),
        v.object({ type: v.string() }),
      );
      expect(() => t.parse({ type: true }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: ["type"],
          expected: ["number", "string"],
        });
    });
    it("discriminates based on literal values", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.literal(2) }),
      );
      expect(() => t.parse({ type: 3 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_literal",
          path: ["type"],
          expected: [1, 2],
        });
    });
    it("discriminates based on mixture of base types and literal values", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.string() }),
      );
      expect(() => t.parse({ type: true }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          path: ["type"],
          expected: ["number", "string"],
        });
    });
    it("considers unknown() to overlap with everything except never()", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.unknown().assert(() => false) }),
      );
      expect(() => t.parse({ type: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({ code: "invalid_union" });
    });
    it("considers literals to overlap with their base types", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.number() }),
      );
      expect(() => t.parse({ type: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({ code: "invalid_union" });
    });
    it("considers optional() its own type", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.literal(2).optional() }),
      );
      expect(() => t.parse({ type: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_type",
          expected: ["number", "undefined"],
        });
    });
    it("matches missing values to optional()", () => {
      const t = v.union(v.object({ a: v.unknown().optional() }));
      expect(t.parse({})).to.deep.equal({});
    });
    it("considers equal literals to overlap", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.literal(1) }),
      );
      expect(() => t.parse({ type: "test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({ code: "invalid_union" });
    });
    it("allows mixing literals and non-literals as long as they don't overlap", () => {
      const t = v.union(
        v.object({ type: v.literal(1) }),
        v.object({ type: v.literal(2) }),
        v.object({ type: v.string() }),
      );
      expect(t.parse({ type: 1 })).toEqual({ type: 1 });
      expect(t.parse({ type: 2 })).toEqual({ type: 2 });
      expect(t.parse({ type: "test" })).toEqual({ type: "test" });
    });
    it("folds multiple overlapping types together in same branch", () => {
      const t = v.union(
        v.object({
          type: v.union(v.string(), v.union(v.string(), v.literal("test"))),
        }),
        v.object({
          type: v.union(v.literal(2), v.undefined()),
          other: v.literal("test"),
        }),
      );
      expect(() => t.parse({ type: 2, other: "not_test" }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0]")
        .that.deep.includes({
          code: "invalid_literal",
          path: ["other"],
          expected: ["test"],
        });
    });
    it("considers two optionals to overlap", () => {
      const t = v.union(
        v.object({ type: v.literal(1).optional() }),
        v.object({ type: v.literal(2).optional() }),
      );
      expect(() => t.parse({ type: 3 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0].code", "invalid_union");
    });
    it("considers two optionals and undefineds to overlap", () => {
      const t = v.union(
        v.object({ type: v.undefined() }),
        v.object({ type: v.literal(2).optional() }),
      );
      expect(() => t.parse({ type: 3 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0].code", "invalid_union");
    });
    it("considers two unions with partially same types to overlap", () => {
      const t = v.union(
        v.object({ type: v.union(v.literal(1), v.literal(2)) }),
        v.object({ type: v.union(v.literal(2), v.literal(3)) }),
      );
      expect(() => t.parse({ type: 4 }))
        .to.throw(v.ValitaError)
        .with.nested.property("issues[0].code", "invalid_union");
    });
    it("keeps transformed values", () => {
      const t = v.union(
        v.object({ type: v.literal("test1").map(() => 1) }),
        v.object({ type: v.literal("test2").map(() => 2) }),
      );
      expect(t.parse({ type: "test1" })).to.deep.equal({ type: 1 });
    });
  });
});
