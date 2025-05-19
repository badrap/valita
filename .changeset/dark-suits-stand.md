---
"@badrap/valita": patch
---

Allow passing a type to .chain()

The `.chain()` method of types now accepts other types as-is:

```ts
v.string()                // Accept strings as input,
  .map((s) => Number(s))  // then parse the strings to numbers,
  .chain(v.literal(1));   // and ensure that the parsed number is 1.
```

The parsing mode is propagated to the chained type:

```ts
const example = v.unknown().parse(v.object({ a: v.number() }));

example.parse({ a: 1, b: 2 }, { mode: "strip" });
// { a: 1 }
```
