---
"@badrap/valita": patch
---

Add **experimental** support for `.optional(() => x)`

The `.optional()` method now supports _default value functions_ for replacing `undefined` and missing values from the input and wrapped validator. The functionality is similar to `.default(x)`, except that `defaultFn` has to be a function and is executed for each validation run. This allows patterns like the following:

```ts
const Item = v.object({ id: v.string() });

const Items = v.array(Item).optional(() => []);
```

This avoids a common pitfall with using `.default([])` for the same pattern. As the newly created empty arrays are not shared, mutating them is safe(r) as it doesn't affect other validation outputs.

This feature is marked **experimental** for the time being.
