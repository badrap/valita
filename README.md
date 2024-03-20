# @badrap/valita [![CI](https://github.com/badrap/valita/actions/workflows/ci.yml/badge.svg)](https://github.com/badrap/valita/actions/workflows/ci.yml) [![npm](https://img.shields.io/npm/v/@badrap/valita.svg)](https://www.npmjs.com/package/@badrap/valita) [![JSR](https://jsr.io/badges/@badrap/valita)](https://jsr.io/@badrap/valita)

A TypeScript library for validating & parsing structured objects. The API is _heavily_ influenced by [Zod's](https://github.com/colinhacks/zod/tree/v3) excellent API, while the implementation side aims for the impressive performance of [simple-runtypes](https://github.com/hoeck/simple-runtypes).

```ts
const vehicle = v.union(
  v.object({ type: v.literal("plane"), airline: v.string() }),
  v.object({ type: v.literal("train") }),
  v.object({ type: v.literal("automobile"), make: v.string() }),
);
vehicle.parse({ type: "bike" });
// ValitaError: invalid_literal at .type (expected "plane", "train" or "automobile")
```

> [!NOTE]
> While this package is still evolving, we're currently not accepting any new feature requests or suggestions. Please use the issue tracker for bug reports and security concerns, which we highly value and welcome. Thank you for your understanding ❤️

## Goals and Non-Goals

### Goals

1. **Input Validation & Parsing**: The fundamental goal of the library is to ensure that incoming data, which might not be from a trusted source, aligns with the predetermined format.
2. **Minimalism**: Deliver a streamlined and concentrated library that offers just the essentials.
3. **Extensibility**: Allow users to create their own validators and parsers that cater to specific validation scenarios.

### Non-Goals:

1. **Data Definition**: The library is designed to validate and parse input data as it enters the program, rather than serving as an exhaustive tool for defining all types within the program after obtaining input.
2. **Extensive Built-In Formats**: The library does not prioritize having a large array of built-in validation formats out of the box.
3. **Asynchronous Parsing**: Asynchronous operations are outside the scope for this library.

## Installation

### For Node.js

```sh
npm i @badrap/valita
```

### For Deno

```sh
deno add @badrap/valita
```

## API Reference

This section contains an overview of all validation methods.

### Primitive Types

Let's start with the basics! Like every validation library we support all primitive types like strings, numbers, booleans and more. For example the `v.string()` primitive can be used like this to check whether some input value is a string:

```ts
import * as v from "@badrap/valita";

const t = v.string();
t.parse("Hello, World!");
// "Hello, World!"
```

Try to parse anything that's not a string and you get an error:

```ts
t.parse(1);
// ValitaError: invalid_type at . (expected string)
```

`.parse(...)` is typed in a way that it accepts any type of input value, but returns a properly typed value on success:

```ts
const u: unknown = "Hello, World!";

// TypeScript type checking is happy with this!
const s: string = t.parse(u);
```

The primitive types are:

- `v.string()`: Check that the value is a string.
- `v.number()`: Check that the value is a number (i.e. `typeof value === "number"`, which includes NaN and ±Infinity).
- `v.bigint()`: Check that the value is a [bigint](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt) (i.e. `typeof value === "bigint"`)
- `v.boolean()`: Check that the value is a boolean.
- `v.null()`: Check that the value is `null`.
- `v.undefined()`: Check that the value is `undefined`.

### Literal Types

Sometimes knowing if a value is of a certain type is not enough. We can use the `.literal()` method to check for actual values, like checking if a string is either `"red"`, `"green"` or `"blue"` and not just any string.

```ts
const rgb = v.union(v.literal("red"), v.literal("green"), v.literal("blue"));

rgb.parse("green");
// "green"

rgb.parse("magenta");
// ValitaError: invalid_literal at . (expected "red", "green" or "blue")
```

We can also use this to check for concrete numbers, bigint literals or boolean values:

```ts
v.literal(1); // must be number 1
v.literal(1n); // must be bigint 1n
v.literal(true); // must be true
```

For more complex values you can use the `.assert()`-method. Check out [Custom Validators](#custom-validators) to learn more about it.

### Allow Any / Forbid All

Valita doesn't contain a built-in equivalent to TypeScript's `any` type. However, `v.unknown()` is analogous to TypeScript's `unknown` type and can be used to accept any input value:

```ts
const u = v.unknown();

u.parse(1);
// 1
```

The inverse of `v.unknown()` is `v.never()` that fails for every value. This is analogous to TypeScript's `never` type.

```ts
const n = v.never();

n.parse(1);
// ValitaError: invalid_type at . (expected nothing)
```

By themselves `v.unknown()` and `v.never()` are not terribly useful, but they become more relevant with composite types such as [Object Types](#object-types).

### Object Types

Validators can be further combined to larger, arbitrarily complex validators. One such combinator is `v.object(...)`, used to check that the input value is an object that has some named properties, and that those properties have a specific type.

```ts
const o = v.object({
  company: v.string(),

  // Nested objects work fine too!
  address: v.object({
    city: v.string(),
    country: v.string(),
  }),
});

o.parse({
  name: "Acme Inc.",
  address: { city: "Springfield", country: "Freedomland" },
});
// {
//   name: "Acme Inc.",
//   address: { city: "Springfield", country: "Freedomland" },
// }

o.parse({ name: "Acme Inc." });
// ValitaError: missing_value at .address (missing value)
o.parse({
  name: "Acme Inc.",
  ceo: "Wiley E. Coyote",
  address: { city: "Springfield", country: "Freedomland" },
});
// ValitaError: unrecognized_keys at . (unrecognized key "ceo")
```

As seen above, unexpected keys like `"ceo"` are prohibited by default. That default can be changed with [Parsing Modes](#parsing-modes).

#### Parsing Modes

By default `v.object(...)` throws an error when it encounters an object with unexpected keys. That behavior can be changed by explicitly passing a _parsing mode_ to `.parse(...)`:

```ts
const o = v.object({
  name: v.string(),
});

// Strip away the extra keys
o.parse({ name: "Acme Inc.", ceo: "Wiley E. Coyote" }, { mode: "strip" });
// { name: "Acme Inc." }

// Pass the extra keys through as-is
o.parse({ name: "Acme Inc.", ceo: "Wiley E. Coyote" }, { mode: "passthrough" });
// { name: "Acme Inc.", ceo: "Wiley E. Coyote" }

// Forbid extra keys. This is the default.
o.parse({ name: "Acme Inc.", ceo: "Wiley E. Coyote" }, { mode: "strict" });
// ValitaError: unrecognized_keys at . (unrecognized key "ceo")
```

The possible values are:

- `{ mode: "strict" }`: Forbid extra keys. This is the default.
- `{ mode: "strip" }`: Don't fail on extra keys - instead strip them away from the output object.
- `{ mode: "passthrough" }`: Just ignore the extra keys and pretend you didn't see them.

The parsing mode applies to all levels of your validation hierarcy, even to nested objects.

```ts
const o = v.object({
  company: v.object({
    name: v.string(),
  }),
});

o.parse(
  {
    company: { name: "Acme Inc.", ceo: "Wiley E. Coyote" },
    greeting: "Hello!",
  },
  { mode: "strip" },
);
// { company: { name: "Acme Inc." } }
```

#### Rest Properties & Records

Sometimes you may want to allow extra keys in addition to the defined keys. For that you can use `.rest(...)`, and additionally require the extra keys to have a specific type of value:

```ts
const o = v
  .object({
    name: v.string(),
    age: v.number(),
  })
  .rest(v.string());

o.parse({ name: "Example McExampleface", age: 42, socks: "yellow" });
// { name: "Example McExampleface", age: 42, socks: "yellow" }

o.parse({ name: "Example McExampleface", age: 42, numberOfDogs: 2 });
// ValitaError: invalid_type at .numberOfDogs (expected string)
```

The `.rest(...)` method is also handy for allowing or forbidding extra keys for a specific parts of your object hierarchy, regardless of the parsing mode.

```ts
const lenient = v.object({}).rest(v.unknown()); // *Always* allow extra keys
lenient.parse({ socks: "yellow" }, { mode: "strict" });
// { socks: "yellow" }

const strict = v.object({}).rest(v.never()); // *Never* allow extra keys
strict.parse({ socks: "yellow" }, { mode: "strip" });
// ValitaError: invalid_type at .socks (expected nothing)
```

For always allowing a completely arbitrary number of properties, `v.record(...)` is shorthand for `v.object({}).rest(...)`. This is analogous to the `Record<string, ...>` type in TypeScript.

```ts
const r = v.record(v.number());

r.parse({ a: 1, b: 2 });
// { a: 1, b: 2 }

r.parse({ a: 1, b: "hello" });
// ValitaError: invalid_type at .b (expected number)
```

#### Optional Properties

One common API pattern is that some object fields are _optional_, i.e. they can be missing completely or be set to `undefined`. You can allow some keys to be missing by annotating them with `.optional()`.

```ts
const person = v.object({
  name: v.string(),
  // Not everyone filled in their theme song
  themeSong: v.string().optional(),
});

person.parse({ name: "Jane Doe", themeSong: "Never gonna give you up" });
// { name: "Jane Doe", themeSong: "Never gonna give you up" }
person.parse({ name: "Jane Doe" });
// { name: "Jane Doe" }
person.parse({ name: "Jane Doe", themeSong: undefined });
// { name: "Jane Doe", themeSong: undefined }
```

Optionals are only used with `v.object(...)` and don't work as standalone parsers.

```ts
const t = v.string().optional();

// TypeScript error: Property 'parse' does not exist on type 'Optional<string>'
t.parse("Hello, World!");
```

The `.default(...)` method can be used to set a default value for a missing or undefined value.

```ts
const person = v.object({
  name: v.string(),
  // Set a sensible default for those unwilling to fill in their theme song
  themeSong: v.string().default("Tribute"),
});

person.parse({ name: "Jane Doe", themeSong: "Never gonna give you up" });
// { name: "Jane Doe", themeSong: "Never gonna give you up" }
person.parse({ name: "Jane Doe" });
// { name: "Jane Doe", themeSong: "Tribute" }
person.parse({ name: "Jane Doe", themeSong: undefined });
// { name: "Jane Doe", themeSong: "Tribute" }
```

### Array Types

The `v.array(...)` combinator can be used to check that the value is an array, and that its items have a specific type. The validated arrays may be of arbitrary length, including empty arrays.

```ts
const a = v.array(v.object({ name: v.string() }));

a.parse([{ name: "Acme Inc." }, { name: "Evil Corporation" }]);
// [{ name: "Acme Inc." }, { name: "Evil Corporation" }]
a.parse([]);
// []

a.parse({ 0: { name: "Acme Inc." } });
// ValitaError: invalid_type at . (expected array)
```

### Tuple Types

Despite JavaScript not having tuple values ([...yet?](https://github.com/tc39/proposal-record-tuple)), many APIs emulate them with arrays. For example, if we needed to encode a range between two numbers we might choose `type Range = [number, number]` as the data type. From JavaScript's point of view it's just an array but TypeScript knows about the value of each position and that the array **must** have two entries.

We can express this kind of type with `v.tuple(...)`:

```ts
const range = v.tuple([v.number(), v.number()]);

range.parse([1, 2]);
// [1, 2]
range.parse([200, 2]);
// [200, 2]

range.parse([1]);
// ValitaError: invalid_length at . (expected an array with 2 item(s))
range.parse([1, 2, 3]);
// ValitaError: invalid_length at . (expected an array with 2 item(s))
range.parse([1, "2"]);
// ValitaError: invalid_type at .1 (expected number)
```

### Union Types

A union type is a value which can have several different representations. Let's imagine we have a value of type `Shape` that can be either a triangle, a circle or a square:

```ts
const triangle = v.object({ type: v.literal("triangle") });
const square = v.object({ type: v.literal("square") });
const circle = v.object({ type: v.literal("circle") });

const shape = v.union(triangle, square, circle);

shape.parse({ type: "triangle" });
// { type: "triangle" }

shape.parse({ type: "heptagon" });
// ValitaError: invalid_literal at .type (expected "triangle", "square" or "circle")
```

Note that although in this example all representations are objects and have the shared property `type`, it's not necessary at all. Each representation can have completely different base type.

```ts
const primitive = v.union(v.number(), v.string(), v.boolean());

primitive.parse("Hello, World!");
// "Hello, World!"

primitive.parse({});
// ValitaError: invalid_type at . (expected number, string or boolean)
```

#### Nullable Type

When working with APIs or databases some types may be nullable. The `t.nullable()` shorthand returns a validator equivalent to `v.union(v.null(), t)`.

```ts
// type name = null | string
const name = v.string().nullable();

// Passes
name.parse("Acme Inc.");
// Passes
name.parse(null);
```

### Recursive Types

Some types can contain arbitrary nesting, like `type T = string | T[]`. We can express such types with `.lazy(...)`.

Note that TypeScript can not infer return types of recursive functions. That's why `v.lazy(...)` validators need to be explicitly typed with `v.Type<T>`.

```ts
type T = string | T[];
const myType: v.Type<T> = v.lazy(() => v.union(v.string(), v.array(myType)));
```

### Custom Validators

The `.assert()` method can be used for custom validation logic, like checking that object properties are internally consistent.

```ts
const Span = v
  .object({ start: v.number(), end: v.number() })
  .assert((obj) => obj.start <= obj.end);

Span.parse({ start: 1, end: 2 });
// { start: 1, end: 2 }

Span.parse({ start: 2, end: 1 });
// ValitaError: custom_error at . (validation failed)
```

You can also _refine_ the input type by passing in a [type predicate](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates). Note that the type predicate must have a compatible input type.

```ts
function isEventHandlerName(s: string): s is `on${string}` {
  return s.startsWith("on");
}

const e = v.string().assert(isEventHandlerName);

const name: `on${string}` = e.parse("onscroll");
// "onscroll"

e.parse("Steven");
// ValitaError: custom_error at . (validation failed)
```

Each `.assert(...)` returns a new validator, so you can further refine already refined types. You can also pass in a custom failure messages.

```js
const Integer = v.number().assert((n) => Number.isInteger(n), "not an integer");

const Byte = Integer.assert((i) => i >= 0 && i <= 255, "not between 0 and 255");

Byte.parse(1);
// 1

Byte.parse(1.5);
// ValitaError: custom_error at . (not an integer)
Byte.parse(300);
// ValitaError: custom_error at . (not between 0 and 255)
```

Custom validators can be used like any other built-in validator. This means that you can define helpers tailored to your specific use cases and reuse them over and over.

```js
// Reusable custom validator
const Organization = v
  .object({
    name: v.string(),
    active: v.boolean(),
  })
  .assert((org) => org.active);

// Reuse the custom validator
const Transaction = v.object({
  buyer: Organization,
  seller: Organization,
  amount: v.number(),
});
```

### Custom Parsers

While `.assert(...)` can ensure that a value is valid and event refine the value's type, it can't alter the value itself. Yet sometimes we may want to validate and transform the value in one go.

The `.map(...)` method is great for cases when you know that the transformation can't fail. The output type doesn't have to stay same:

```ts
const l = v.string().map((s) => s.length);

l.parse("Hello, World!");
// 13

l.parse(1);
// ValitaError: invalid_type at . (expected string)
```

The `.chain(...)` method is more powerful: it can also be used for cases where the parsing might fail. Imagine a JSON API which outputs dates in the YYYY-MM-DD format and we want to return a valid `Date` from our validation phase:

```json
{
  "created_at": "2022-01-01"
}
```

`.chain(...)`, much like map, receives a function to which it will pass the raw value as the first argument. If the transformation fails, we return an error (with an optional message) with `v.err(...)`. If not, then we return the transformed value with `v.ok(...)`.

```js
const DateType = v.string().chain((s) => {
  const date = new Date(s);

  if (isNaN(+date)) {
    return v.err("invalid date");
  }

  return v.ok(date);
});

const APIResponse = v.object({
  created_at: DateType,
});

APIResponse.parse({ created_at: "2022-01-01" });
// { created_at: 2022-01-01T00:00:00.000Z }

APIResponse.parse({ created_at: "YOLO" });
// ValitaError: custom_error at .created_at (invalid date)
```

For both `.map(...)` and `.chain(...)` we highly recommend to avoid mutating the input value. Prefer returning a new value instead.

```ts
v.object({ name: v.string() }).map((obj) => {
  // Mutating the input value like below is highly discouraged:
  //  obj.id = randomUUID();
  // Return a new value instead:
  return { ...obj, id: randomUUID() };
});
```

### Parsing Without Throwing

The `.parse(...)` method used thus far throws a ValitaError when validation or parsing fails. The `.try(...)` method can be used when you'd rather throw only actually exceptional cases such as coding errors. Parsing modes are also supported.

```ts
const o = v.object({ name: v.string() });

o.try({ name: "Acme Inc." });
// { ok: true, value: { name: "Acme Inc." } }
o.try({ name: "Acme Inc.", country: "Freedomland" }, { mode: "strip" });
// { ok: true, value: { name: "Acme Inc." } }

o.try({});
// { ok: false, message: "missing_value at .name (missing value)" }
```

The `.ok` property can be used to inspect the outcome in a typesafe way.

```ts
// Fail about 50% of the time
const r = o.try(Math.random() < 0.5 ? { name: "Acme Inc." } : {});

if (r.ok) {
  // r.value is defined within this block
  console.log(`Success: ${r.value}`);
} else {
  // r.message is defined within this block
  console.log(`Failure: ${r.message}`);
}
```

For allow further composition, `.try(...)`'s return values are compatible with `.chain(...)`. The chained function also receives a second parameter that contains the parsing mode, and can be passed forward to `.try(...)`.

```ts
const Company = v.object({ name: v.string() });

const CompanyString = v.string().chain((json, options) => {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return v.err("not valid JSON");
  }
  return Company.try(value, options);
});

CompanyString.parse('{ "name": "Acme Inc." }');
// { name: "Acme Inc." }

CompanyString.parse('{ "name": "Acme Inc.", "ceo": "Wiley E. Coyote" }');
// ValitaError: unrecognized_keys at . (unrecognized key "ceo")

// The parsing mode is forwarded to .try(...)
CompanyString.parse('{ "name": "Acme Inc.", "ceo": "Wiley E. Coyote" }', {
  mode: "strip",
});
// { name: 'Acme Inc.' }
```

### Inferring Output Types

The exact output type of a validator can be _inferred_ from a type validator's using with `v.Infer<typeof ...>`:

```ts
const Person = v.object({
  name: v.string(),
  age: v.number().optional(),
});

type Person = v.Infer<typeof Person>;
// type Person = { name: string, age?: number };
```

### Type Composition Tips & Tricks

#### Reduce, Reuse, Recycle

The API interface of this library is intentionally kept small - for some definition of small. As such we encourage curating a library of helpers tailored for your specific needs. For example a reusable helper for ensuring that a number falls between a specific range could be defined and used like this:

```ts
function between(min: number, max: number) {
  return (n: number) => {
    if (n < min || n > max) {
      return v.err("outside range");
    }
    return v.ok(n);
  };
}

const num = v.number().chain(between(0, 255));
```

#### Type Inference & Generics

Every standalone validator fits the type `v.Type<Output>`, `Output` being the validator's output type. TypeScript's generics and type inference can be used to define helpers that take in validators and do something with them. For example a `readonly(...)` helper that casts the output type to a readonly (non-recursively) could be defined and used as follows:

```ts
function readonly<T>(t: v.Type<T>): v.Type<Readonly<T>> {
  return t as v.Type<Readonly<T>>;
}

const User = readonly(v.object({ id: v.string() }));
type User = v.Infer<typeof User>;
// type User = { readonly id: string; }
```

#### Deconstructed Helpers

Some validator types offer additional properties and methods for introspecting and transforming them further. One such case is `v.object(...)`'s `.shape` property that contains the validators for each property.

```ts
const Company = v.object({
  name: v.string().assert((s) => s.length > 0, "empty name"),
});
Company.shape.name.parse("Acme Inc.");
// "Acme Inc."
```

However, because `.assert(...)`, `.map(...)` and `.chain(...)` may all restrict and transform the output type almost arbitrarily, their returned validators may not have the properties or methods specific to the original ones. For example a refined `v.object(...)` validator will not have the `.shape` property. Therefore the following will not work:

```ts
const Company = v
  .object({
    name: v.string().assert((s) => s.length > 0, "empty name"),
    employees: v.number(),
  })
  .assert((c) => c.employees >= 0);

const Organization = v.object({
  // Try to reuse Company's handy name validator
  name: Company.shape.name,
});
// TypeScript error: Property 'shape' does not exist on type 'Type<{ name: string; }>'
```

The recommended solution is to deconstruct the original validators enough so that the common pieces can be directly reused:

```ts
const NonEmptyString = v.string().assert((s) => s.length > 0, "empty");

const Company = v
  .object({
    name: NonEmptyString,
    employees: v.number(),
  })
  .assert((c) => c.employees >= 0);

const Organization = v.object({
  name: NonEmptyString,
});
```

## License

This library is licensed under the MIT license. See [LICENSE](./LICENSE).
