# @badrap/valita [![tests](https://github.com/badrap/valita/workflows/tests/badge.svg)](https://github.com/badrap/valita/actions?query=workflow%3Atests) [![npm](https://img.shields.io/npm/v/@badrap/valita.svg)](https://www.npmjs.com/package/@badrap/valita)

A TypeScript library for validating & parsing structured objects. The API is _heavily_ influenced by [Zod's](https://github.com/colinhacks/zod/tree/v3) excellent API, while the implementation side aims for the impressive performance of [simple-runtypes](https://github.com/hoeck/simple-runtypes).

## Installation

```
npm i @badrap/valita
```

## Docs aren't my forté

A motivating example in lack of any better documentation:

```ts
import * as v from "@badrap/valita";

const Pet = v.object({
  type: v.union(v.literal("dog"), v.literal("cat")),
  name: v.string(),
});

const Person = v.object({
  name: v.string(),
  age: v.number(),
  pets: v.array(Pet).optional(),
});
```

Now `Person.parse(value)` returns `value` if it matches the Person schema - or throws an error otherwise.

```ts
const grizzlor = Person.parse({
  name: "Grizzlor",
  age: 101,
  pets: [
    { type: "cat", name: "Mittens" },
    { type: "cat", name: "Parsley" },
    { type: "cat", name: "Lulu" },
    { type: "cat", name: "Thomas Percival Meowther III" },
  ],
});
```

The real magic here comes from TypeScript's type inference. The inferred type for `grizzlor` is:

```ts
const grizzlor: {
  name: string;
  age: number;
  pets?: { type: "dog" | "cat"; name: string }[] | undefined;
};
```

In fact, you can get your mitts on the this type in the code:

```ts
type PersonType = v.infer<typeof Person>;
```

## License

This library is licensed under the MIT license. See [LICENSE](./LICENSE).
