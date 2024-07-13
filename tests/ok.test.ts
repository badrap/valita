import { describe, it, expectTypeOf } from "vitest";
import * as v from "../src";

describe("ok()", () => {
  it("infers literals when possible", () => {
    const t = v.number().chain(() => v.ok("test"));
    expectTypeOf<v.Infer<typeof t>>().toEqualTypeOf<"test">();
  });
});
