import { describe, it, expectTypeOf } from "vitest";
import * as v from "../src";

describe("ok()", () => {
  it("infers literals when possible", () => {
    const _t = v.number().chain(() => v.ok("test"));
    expectTypeOf<v.Infer<typeof _t>>().toEqualTypeOf<"test">();
  });
});
