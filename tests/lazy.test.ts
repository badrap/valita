import { describe, it, expect, expectTypeOf } from "vitest";
import * as v from "../src";

describe("lazy()", () => {
  it("allows recursive type definitions", () => {
    type T =
      | undefined
      | {
          t: T;
        };
    const t: v.Type<T> = v.lazy(() => v.union(v.undefined(), v.object({ t })));
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<T>();
  });
  it("allows mutually recursive type definitions", () => {
    type A =
      | undefined
      | {
          b: B;
        };
    type B = undefined | A[];
    const a: v.Type<A> = v.lazy(() => v.union(v.undefined(), v.object({ b })));
    const b: v.Type<B> = v.lazy(() => v.union(v.undefined(), v.array(a)));
    expectTypeOf<v.Infer<typeof a>>().toEqualTypeOf<A>();
    expectTypeOf<v.Infer<typeof b>>().toEqualTypeOf<B>();
  });
  it("allows referencing object matchers that are defined later", () => {
    const a: v.Type = v.lazy(() => v.union(v.undefined(), b));
    const b = v.object({ a });
    expect(a.parse(undefined)).to.equal(undefined);
  });
  it("allows referencing union matchers that are defined later", () => {
    const a: v.Type = v.lazy(() => v.union(v.undefined(), b));
    const b = v.union(a);
    expect(a.parse(undefined)).to.equal(undefined);
  });
  it("fail typecheck on conflicting return type", () => {
    type T =
      | undefined
      | {
          t: T;
        };
    expectTypeOf(
      v.lazy(() => v.union(v.undefined(), v.object({ t: v.number() }))),
    ).not.toMatchTypeOf<v.Type<T>>();
  });
  it("parses recursively", () => {
    type T =
      | undefined
      | {
          t: T;
        };
    const t: v.Type<T> = v.lazy(() => v.union(v.undefined(), v.object({ t })));
    expect(t.parse({ t: { t: { t: undefined } } })).to.deep.equal({
      t: { t: { t: undefined } },
    });
    expect(() => t.parse({ t: { t: { t: 1 } } })).to.throw(
      v.ValitaError,
      "invalid_type at .t.t.t (expected undefined or object)",
    );
  });
  it("parses recursively", () => {
    type T = {
      t?: T;
    };
    const t: v.Type<T> = v.lazy(() => v.object({ t: t.optional() }));
    expect(t.parse({ t: { t: { t: undefined } } })).to.deep.equal({
      t: { t: { t: undefined } },
    });
    expect(() => t.parse({ t: { t: { t: 1 } } })).to.throw(
      v.ValitaError,
      "invalid_type at .t.t.t (expected object)",
    );
  });
});
