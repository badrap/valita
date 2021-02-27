import { expect } from "chai";
import * as v from "../src";

describe("string()", () => {
  it("accepts strings", () => {
    const t = v.string();
    expect(t.parse("test")).to.equal("test");
  });
});
