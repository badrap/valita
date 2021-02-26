# @badrap/valita [![tests](https://github.com/badrap/valita/workflows/tests/badge.svg)](https://github.com/badrap/valita/actions?query=workflow%3Atests) [![npm](https://img.shields.io/npm/v/@badrap/valita.svg)](https://www.npmjs.com/package/@badrap/valita)

A TypeScript library for validating & parsing structured objects. The API is _heavily_ influenced by [Zod's](https://github.com/colinhacks/zod/tree/v3) excellent API, while aiming for the impressive performance of [simple-runtypes](https://github.com/hoeck/simple-runtypes) on the implementation side.

## Installation

```
npm i @badrap/valita
```

## Docs aren't my forté

A motivating example in lack of any better documentation:

```ts
import * as v from "@badrap/valita";

const Thing = v.object({
  name: v.string(),
  age: v.number(),
  exists: v.boolean(),
  
  subThing: v.object({
    text: v.string(),
    count: v.number(),
  }).optional()
});
```

Now `Thing.parse(value)` returns `value` if it matches the Thing schema - or throws an error otherwise.

```ts
const gragnor = Thing.parse({ name: "Gragnor", age: 101, exists: true });
```

The real magic here comes from TypeScript's type inference. The inferred type for `gragnor` is:

```ts
const gragnor: {
   name: string;
   age: number;
   exists: string;
   subThing?: {
       text: string;
       count: number;
   } | undefined;   
}
```

## License

This library is licensed under the MIT license. See [LICENSE](./LICENSE).
