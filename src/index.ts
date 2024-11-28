/**
 * @module
 * A typesafe validation & parsing library for TypeScript.
 *
 * @example
 * ```ts
 * import * as v from "@badrap/valita";
 *
 * const vehicle = v.union(
 *   v.object({ type: v.literal("plane"), airline: v.string() }),
 *   v.object({ type: v.literal("train") }),
 *   v.object({ type: v.literal("automobile"), make: v.string() })
 * );
 * vehicle.parse({ type: "bike" });
 * // ValitaError: invalid_literal at .type (expected "plane", "train" or "automobile")
 * ```
 */

// This is magic that turns object intersections to nicer-looking types.
type PrettyIntersection<V> = Extract<{ [K in keyof V]: V[K] }, unknown>;

type Literal = string | number | bigint | boolean;
type Key = string | number;
type InputType =
  | "object"
  | "array"
  | "null"
  | "undefined"
  | "string"
  | "number"
  | "bigint"
  | "boolean";

type CustomError =
  | undefined
  | string
  | {
      message?: string;
      path?: Key[];
    };

type IssueLeaf = Readonly<
  | { ok: false; code: "custom_error"; error: CustomError }
  | { ok: false; code: "invalid_type"; expected: InputType[] }
  | { ok: false; code: "missing_value" }
  | { ok: false; code: "invalid_literal"; expected: Literal[] }
  | { ok: false; code: "unrecognized_keys"; keys: Key[] }
  | { ok: false; code: "invalid_union"; tree: IssueTree }
  | {
      ok: false;
      code: "invalid_length";
      minLength: number;
      maxLength: number | undefined;
    }
>;

type IssueTree =
  | Readonly<{ ok: false; code: "prepend"; key: Key; tree: IssueTree }>
  | Readonly<{ ok: false; code: "join"; left: IssueTree; right: IssueTree }>
  | IssueLeaf;

type Issue = Readonly<
  | { code: "custom_error"; path: Key[]; error: CustomError }
  | { code: "invalid_type"; path: Key[]; expected: InputType[] }
  | { code: "missing_value"; path: Key[] }
  | { code: "invalid_literal"; path: Key[]; expected: Literal[] }
  | { code: "unrecognized_keys"; path: Key[]; keys: Key[] }
  | { code: "invalid_union"; path: Key[]; tree: IssueTree }
  | {
      code: "invalid_length";
      path: Key[];
      minLength: number;
      maxLength: number | undefined;
    }
>;

function joinIssues(left: IssueTree | undefined, right: IssueTree): IssueTree {
  return left ? { ok: false, code: "join", left, right } : right;
}

function prependPath(key: Key, tree: IssueTree): IssueTree {
  return { ok: false, code: "prepend", key, tree };
}

function cloneIssueWithPath(tree: IssueLeaf, path: Key[]): Issue {
  const code = tree.code;
  switch (code) {
    case "invalid_type":
      return { code, path, expected: tree.expected };
    case "invalid_literal":
      return { code, path, expected: tree.expected };
    case "missing_value":
      return { code, path };
    case "invalid_length":
      return {
        code,
        path,
        minLength: tree.minLength,
        maxLength: tree.maxLength,
      };
    case "unrecognized_keys":
      return { code, path, keys: tree.keys };
    case "invalid_union":
      return { code, path, tree: tree.tree };
    case "custom_error":
      return { code, path, error: tree.error };
  }
}

function collectIssues(
  tree: IssueTree,
  path: Key[] = [],
  issues: Issue[] = [],
): Issue[] {
  for (;;) {
    if (tree.code === "join") {
      collectIssues(tree.left, path.slice(), issues);
      tree = tree.right;
    } else if (tree.code === "prepend") {
      path.push(tree.key);
      tree = tree.tree;
    } else {
      if (
        tree.code === "custom_error" &&
        typeof tree.error === "object" &&
        tree.error.path !== undefined
      ) {
        path.push(...tree.error.path);
      }
      issues.push(cloneIssueWithPath(tree, path));
      return issues;
    }
  }
}

function separatedList(list: string[], sep: "or" | "and"): string {
  if (list.length === 0) {
    return "nothing";
  } else if (list.length === 1) {
    return list[0];
  } else {
    return `${list.slice(0, -1).join(", ")} ${sep} ${list[list.length - 1]}`;
  }
}

function formatLiteral(value: Literal): string {
  return typeof value === "bigint" ? `${value}n` : JSON.stringify(value);
}

function countIssues(tree: IssueTree): number {
  let count = 0;
  for (;;) {
    if (tree.code === "join") {
      count += countIssues(tree.left);
      tree = tree.right;
    } else if (tree.code === "prepend") {
      tree = tree.tree;
    } else {
      return count + 1;
    }
  }
}

function formatIssueTree(tree: IssueTree): string {
  let path = "";
  let count = 0;
  for (;;) {
    if (tree.code === "join") {
      count += countIssues(tree.right);
      tree = tree.left;
    } else if (tree.code === "prepend") {
      path += `.${tree.key}`;
      tree = tree.tree;
    } else {
      break;
    }
  }

  let message = "validation failed";
  if (tree.code === "invalid_type") {
    message = `expected ${separatedList(tree.expected, "or")}`;
  } else if (tree.code === "invalid_literal") {
    message = `expected ${separatedList(
      tree.expected.map(formatLiteral),
      "or",
    )}`;
  } else if (tree.code === "missing_value") {
    message = `missing value`;
  } else if (tree.code === "unrecognized_keys") {
    const keys = tree.keys;
    message = `unrecognized ${
      keys.length === 1 ? "key" : "keys"
    } ${separatedList(keys.map(formatLiteral), "and")}`;
  } else if (tree.code === "invalid_length") {
    const min = tree.minLength;
    const max = tree.maxLength;
    message = `expected an array with `;
    if (min > 0) {
      if (max === min) {
        message += `${min}`;
      } else if (max !== undefined) {
        message += `between ${min} and ${max}`;
      } else {
        message += `at least ${min}`;
      }
    } else {
      message += `at most ${max ?? "∞"}`;
    }
    message += ` item(s)`;
  } else if (tree.code === "custom_error") {
    const error = tree.error;
    if (typeof error === "string") {
      message = error;
    } else if (error !== undefined) {
      if (error.message !== undefined) {
        message = error.message;
      }
      if (error.path !== undefined) {
        path += "." + error.path.join(".");
      }
    }
  }

  let msg = `${tree.code} at .${path.slice(1)} (${message})`;
  if (count === 1) {
    msg += ` (+ 1 other issue)`;
  } else if (count > 1) {
    msg += ` (+ ${count} other issues)`;
  }
  return msg;
}

/**
 * An error type representing one or more validation/parsing errors.
 *
 * The `.message` property gives a short overview of the encountered issues,
 * while the `.issue` property can be used to get a more detailed list.
 *
 * @example
 * ```ts
 * const t = v.object({ a: v.null(), b: v.null() });
 *
 * try {
 *   t.parse({ a: 1 });
 * } catch (err) {
 *   err.message;
 *   // "invalid_type at .a (expected null) (+ 1 other issue)"
 *
 *   err.issues;
 *   // [
 *   //   { code: 'invalid_type', path: [ 'a' ], expected: [ 'null' ] },
 *   //   { code: 'missing_value', path: [ 'b' ] }
 *   // ]
 * }
 * ```
 */
export class ValitaError extends Error {
  private _issues?: Issue[];

  constructor(private readonly issueTree: IssueTree) {
    super(formatIssueTree(issueTree));
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this._issues = undefined;
  }

  get issues(): readonly Issue[] {
    if (this._issues === undefined) {
      this._issues = collectIssues(this.issueTree);
    }
    return this._issues;
  }
}

/**
 * A successful validation/parsing result.
 *
 * Used in situations where both the parsing success and failure
 * cases are returned as values.
 */
export type Ok<T> = {
  readonly ok: true;

  /**
   * The successfully parsed value.
   */
  readonly value: T;
};

/**
 * A validation/parsing failure.
 *
 * Used in situations where both the parsing success and failure
 * cases are returned as values.
 */
export type Err = {
  readonly ok: false;

  /**
   * A condensed overview of the parsing issues.
   */
  readonly message: string;

  /**
   * A detailed list of the parsing issues.
   */
  readonly issues: readonly Issue[];

  /**
   * Throw a new ValitaError representing the parsing issues.
   */
  throw(): never;
};

/**
 * A validation/parsing success or failure.
 *
 * Used by parsing-related methods where and both success and failure
 * cases are returned as values (instead of raising an exception on failure).
 * The most notable example is the `Type.try(...)` method.
 *
 * The `.ok` property can to assert whether the value represents a success or
 * failure and access further information in a typesafe way.
 *
 * @example
 * ```ts
 * const t = v.string();
 *
 * // Make parsing fail or succeed about equally.
 * const result = t.try(Math.random() < 0.5 ? "hello" : null);
 *
 * if (result.ok) {
 *   // TypeScript allows accessing .value within this code block.
 *   console.log(`Success: ${result.value}`);
 * } else {
 *   // TypeScript allows accessing .message within this code block.
 *   console.log(`Failed: ${result.message}`);
 * }
 * ```
 */
export type ValitaResult<V> = Ok<V> | Err;

class ErrImpl implements Err {
  readonly ok = false;
  private _issues?: Issue[];
  private _message?: string;

  constructor(private readonly issueTree: IssueTree) {
    this._issues = undefined;
    this._message = undefined;
  }

  get issues(): readonly Issue[] {
    if (this._issues === undefined) {
      this._issues = collectIssues(this.issueTree);
    }
    return this._issues;
  }

  get message(): string {
    if (this._message === undefined) {
      this._message = formatIssueTree(this.issueTree);
    }
    return this._message;
  }

  throw(): never {
    throw new ValitaError(this.issueTree);
  }
}

/**
 * Create a value for returning a successful parsing result from chain().
 *
 * @example
 * ```ts
 * const t = v.string().chain((s) => v.ok(s + ", world!"));
 *
 * t.parse("Hello");
 * // "Hello, world!"
 * ```
 */
function ok<T extends Literal>(value: T): Ok<T>;
function ok<T>(value: T): Ok<T>;
function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create a value for returning a parsing error from chain().
 *
 * An optional error message can be provided.
 *
 * @example
 * ```ts
 * const t = v.string().chain(() => v.err("bad value"));
 *
 * t.parse("hello");
 * // ValitaError: custom_error at . (bad value)
 * ```
 */
function err(error?: CustomError): Err {
  return new ErrImpl({ ok: false, code: "custom_error", error });
}

type RawResult<T> = undefined | Ok<T> | IssueTree;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const FLAG_FORBID_EXTRA_KEYS = 0x1;
const FLAG_STRIP_EXTRA_KEYS = 0x2;
const FLAG_MISSING_VALUE = 0x4;
type Func<T> = (v: unknown, flags: number) => RawResult<T>;

/**
 * Return the inferred output type of a validator.
 *
 * @example
 * ```ts
 * const t = v.union(v.literal(1), v.string());
 *
 * type T = v.Infer<typeof t>;
 * // type T = 1 | string;
 * ```
 */
export type Infer<T extends AbstractType> =
  T extends AbstractType<infer I> ? I : never;

type ParseOptions = {
  mode?: "passthrough" | "strict" | "strip";
};

abstract class AbstractType<Output = unknown> {
  abstract readonly name: string;
  abstract toTerminals(func: (t: TerminalType) => void): void;
  abstract func(v: unknown, flags: number): RawResult<Output>;

  /**
   * Return new optional type that can not be used as a standalone
   * validator. Rather, it's meant to be used as a with object validators,
   * to mark one of the object's properties as _optional_. Optional property
   * types accept both the original type, `undefined` and missing properties.
   *
   * The optional `defaultFn` function, if provided, will be called each
   * time a value that is missing or `undefined` is parsed.
   *
   * @param [defaultFn] - An optional function returning the default value.
   */
  // Use `<X extends T>() => X` instead of `() => T` to make literal
  // inference work when an optionals with defaultFn is used as a
  // ObjectType property.
  // The same could be accomplished by replacing the `| T` in the
  // output type with `NoInfer<T>`, but it's supported only from
  // TypeScript 5.4 onwards.
  optional<T extends Literal>(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, undefined> | T>;
  // Support parsers like `v.array(t).optional(() => [])`
  // so that the output type is `Infer<typeof t>[]` instead of
  // `Infer<typeof t>[] | never[]`.
  optional(
    defaultFn: () => Exclude<Output, undefined>,
  ): Type<Exclude<Output, undefined>>;
  optional<T>(defaultFn: () => T): Type<Exclude<Output, undefined> | T>;
  optional(): Optional<Output>;
  optional<T>(
    defaultFn?: () => T,
  ): Type<Exclude<Output, undefined> | T> | Optional<Output> {
    const optional = new Optional(this);
    if (!defaultFn) {
      return optional;
    }
    return new TransformType(optional, (v) => {
      return v === undefined ? { ok: true, value: defaultFn() } : undefined;
    });
  }

  /**
   * @deprecated Instead of `.default(x)` use `.optional(() => x)`.
   */
  default<T extends Literal>(
    defaultValue: T,
  ): Type<Exclude<Output, undefined> | T>;
  default<T>(defaultValue: T): Type<Exclude<Output, undefined> | T>;
  default<T>(defaultValue: T): Type<Exclude<Output, undefined> | T> {
    const defaultResult = ok(defaultValue);
    return new TransformType(this.optional(), (v) => {
      return v === undefined ? defaultResult : undefined;
    });
  }

  assert<T extends Output>(
    func:
      | ((v: Output, options: ParseOptions) => v is T)
      | ((v: Output, options: ParseOptions) => boolean),
    error?: CustomError,
  ): Type<T> {
    const err: IssueLeaf = { ok: false, code: "custom_error", error };
    return new TransformType(this, (v, options) =>
      func(v as Output, options) ? undefined : err,
    );
  }

  map<T extends Literal>(
    func: (v: Output, options: ParseOptions) => T,
  ): Type<T>;
  map<T>(func: (v: Output, options: ParseOptions) => T): Type<T>;
  map<T>(func: (v: Output, options: ParseOptions) => T): Type<T> {
    return new TransformType(this, (v, options) => ({
      ok: true,
      value: func(v as Output, options),
    }));
  }

  chain<T extends Literal>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T>;
  chain<T>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T>;
  chain<T>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T> {
    return new TransformType(this, (v, options) => {
      const r = func(v as Output, options);
      return r.ok ? r : (r as unknown as { issueTree: IssueTree }).issueTree;
    });
  }
}

/**
 * A base class for all concreate validators/parsers.
 */
abstract class Type<Output = unknown> extends AbstractType<Output> {
  /**
   * Return new validator that accepts both the original type and `null`.
   */
  nullable(): Type<null | Output> {
    return new Nullable(this);
  }

  toTerminals(func: (t: TerminalType) => void): void {
    func(this as TerminalType);
  }

  /**
   * Parse a value without throwing.
   */
  try(v: unknown, options?: ParseOptions): ValitaResult<Infer<this>> {
    let flags = FLAG_FORBID_EXTRA_KEYS;
    if (options?.mode === "passthrough") {
      flags = 0;
    } else if (options?.mode === "strip") {
      flags = FLAG_STRIP_EXTRA_KEYS;
    }

    const r = this.func(v, flags);
    if (r === undefined) {
      return { ok: true, value: v as Infer<this> };
    } else if (r.ok) {
      return { ok: true, value: r.value as Infer<this> };
    } else {
      return new ErrImpl(r);
    }
  }

  /**
   * Parse a value. Throw a ValitaError on failure.
   */
  parse(v: unknown, options?: ParseOptions): Infer<this> {
    let flags = FLAG_FORBID_EXTRA_KEYS;
    if (options?.mode === "passthrough") {
      flags = 0;
    } else if (options?.mode === "strip") {
      flags = FLAG_STRIP_EXTRA_KEYS;
    }

    const r = this.func(v, flags);
    if (r === undefined) {
      return v as Infer<this>;
    } else if (r.ok) {
      return r.value as Infer<this>;
    } else {
      throw new ValitaError(r);
    }
  }
}

class Nullable<Output = unknown> extends Type<Output | null> {
  readonly name = "nullable";

  constructor(private readonly type: Type<Output>) {
    super();
  }

  func(v: unknown, flags: number): RawResult<Output | null> {
    return v === null ? undefined : this.type.func(v, flags);
  }

  toTerminals(func: (t: TerminalType) => void): void {
    func(nullSingleton);
    this.type.toTerminals(func);
  }

  nullable(): Type<Output | null> {
    return this;
  }
}

/**
 * A validator/parser marked as "optional", signifying that their value can
 * be missing from the parsed object.
 *
 * As such optionals can only be used as property validators within
 * object validators.
 */
class Optional<Output = unknown> extends AbstractType<Output | undefined> {
  readonly name = "optional";

  constructor(private readonly type: AbstractType<Output>) {
    super();
  }

  func(v: unknown, flags: number): RawResult<Output | undefined> {
    return v === undefined || flags & FLAG_MISSING_VALUE
      ? undefined
      : this.type.func(v, flags);
  }

  toTerminals(func: (t: TerminalType) => void): void {
    func(this);
    func(undefinedSingleton);
    this.type.toTerminals(func);
  }

  optional<T extends Literal>(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, undefined> | T>;
  optional(
    defaultFn: () => Exclude<Output, undefined>,
  ): Type<Exclude<Output, undefined>>;
  optional<T>(defaultFn: () => T): Type<Exclude<Output, undefined> | T>;
  optional(): Optional<Output>;
  optional<T>(
    defaultFn?: () => T,
  ): Type<Exclude<Output, undefined> | T> | Optional<Output> {
    if (!defaultFn) {
      return this;
    }
    return new TransformType(this, (v) => {
      return v === undefined ? { ok: true, value: defaultFn() } : undefined;
    });
  }
}

type ObjectShape = Record<string, AbstractType>;

type ObjectOutput<
  T extends ObjectShape,
  R extends AbstractType | undefined,
> = PrettyIntersection<
  {
    [K in keyof T as T[K] extends Optional ? K : never]?: Infer<T[K]>;
  } & {
    [K in keyof T as T[K] extends Optional ? never : K]: Infer<T[K]>;
  } & (R extends Type<infer I>
      ? Record<string, I>
      : R extends Optional<infer J>
        ? Partial<Record<string, J>>
        : unknown)
>;

// A bitset type, used for keeping track which known (required & optional) keys
// the object validator has seen. Basically, when key `knownKey` is encountered,
// the corresponding bit at index `keys.indexOf(knownKey)` gets flipped to 1.
//
// BitSet values initially start as a number (to avoid garbage collector churn),
// and an empty BitSet is initialized like this:
//    let bitSet: BitSet = 0;
//
// As JavaScript bit arithmetic for numbers can only deal with 32-bit numbers,
// BitSet values are upgraded to number arrays if a bits other than 0-31 need
// to be flipped.
type BitSet = number | number[];

// Set a bit in position `index` to one and return the updated bitset.
// This function may or may not mutate `bits` in-place.
function setBit(bits: BitSet, index: number): BitSet {
  if (typeof bits !== "number") {
    const idx = index >> 5;
    for (let i = bits.length; i <= idx; i++) {
      bits.push(0);
    }
    bits[idx] |= 1 << index % 32;
    return bits;
  } else if (index < 32) {
    return bits | (1 << index);
  } else {
    return setBit([bits, 0], index);
  }
}

// Get the bit at position `index`.
function getBit(bits: BitSet, index: number): number {
  if (typeof bits === "number") {
    return index < 32 ? (bits >>> index) & 1 : 0;
  } else {
    return (bits[index >> 5] >>> index % 32) & 1;
  }
}

class ObjectType<
  Shape extends ObjectShape = ObjectShape,
  Rest extends AbstractType | undefined = AbstractType | undefined,
> extends Type<ObjectOutput<Shape, Rest>> {
  readonly name = "object";

  private _func?: (
    obj: Record<string, unknown>,
    flags: number,
  ) => RawResult<unknown>;

  private _invalidType: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: ["object"],
  };

  constructor(
    readonly shape: Shape,
    private readonly restType: Rest,
    private readonly checks?: {
      func: (v: unknown) => boolean;
      issue: IssueLeaf;
    }[],
  ) {
    super();
  }

  check(
    func: (v: ObjectOutput<Shape, Rest>) => boolean,
    error?: CustomError,
  ): ObjectType<Shape, Rest> {
    const issue: IssueLeaf = { ok: false, code: "custom_error", error };
    return new ObjectType(this.shape, this.restType, [
      ...(this.checks ?? []),
      {
        func: func as (v: unknown) => boolean,
        issue,
      },
    ]);
  }

  func(v: unknown, flags: number): RawResult<ObjectOutput<Shape, Rest>> {
    if (!isObject(v)) {
      return this._invalidType;
    }

    let func = this._func;
    if (func === undefined) {
      func = createObjectMatcher(this.shape, this.restType, this.checks);
      this._func = func;
    }
    return func(v, flags) as RawResult<ObjectOutput<Shape, Rest>>;
  }

  rest<R extends Type>(restType: R): ObjectType<Shape, R> {
    return new ObjectType(this.shape, restType);
  }

  extend<S extends ObjectShape>(
    shape: S,
  ): ObjectType<Omit<Shape, keyof S> & S, Rest> {
    return new ObjectType(
      { ...this.shape, ...shape } as Omit<Shape, keyof S> & S,
      this.restType,
    );
  }

  pick<K extends (keyof Shape)[]>(
    ...keys: K
  ): ObjectType<Pick<Shape, K[number]>, undefined> {
    const shape = {} as Pick<Shape, K[number]>;
    keys.forEach((key) => {
      shape[key] = this.shape[key];
    });
    return new ObjectType(shape, undefined);
  }

  omit<K extends (keyof Shape)[]>(
    ...keys: K
  ): ObjectType<Omit<Shape, K[number]>, Rest> {
    const shape = { ...this.shape };
    keys.forEach((key) => {
      delete shape[key];
    });
    return new ObjectType(shape as Omit<Shape, K[number]>, this.restType);
  }

  partial(): ObjectType<
    { [K in keyof Shape]: Optional<Infer<Shape[K]>> },
    Rest extends AbstractType<infer I> ? Optional<I> : undefined
  > {
    const shape = {} as Record<string, unknown>;
    Object.keys(this.shape).forEach((key) => {
      shape[key] = this.shape[key].optional();
    });
    const rest = this.restType?.optional();
    return new ObjectType(
      shape as { [K in keyof Shape]: Optional<Infer<Shape[K]>> },
      rest as Rest extends AbstractType<infer I> ? Optional<I> : undefined,
    );
  }
}

function set(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "__proto__") {
    Object.defineProperty(obj, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  } else {
    obj[key] = value;
  }
}

function createObjectMatcher(
  shape: ObjectShape,
  rest?: AbstractType,
  checks?: {
    func: (v: unknown) => boolean;
    issue: IssueLeaf;
  }[],
): (v: Record<string, unknown>, flags: number) => RawResult<unknown> {
  const missingValue = {
    ok: false,
    code: "missing_value",
  } as const;

  const indexedEntries = Object.keys(shape).map((key) => {
    const type = shape[key];

    let optional = false as boolean;
    type.toTerminals((t) => {
      optional ||= t.name === "optional";
    });

    return {
      key,
      type,
      optional,
      missing: prependPath(key, missingValue),
    };
  });

  if (indexedEntries.length === 0 && rest?.name === "unknown") {
    // A fast path for record(unknown())
    return function (obj, _) {
      if (checks !== undefined) {
        for (let i = 0; i < checks.length; i++) {
          if (!checks[i].func(obj)) {
            return checks[i].issue;
          }
        }
      }
      return undefined;
    };
  }

  const keyedEntries = Object.create(null) as Record<
    string,
    { index: number; type: AbstractType } | undefined
  >;
  indexedEntries.forEach((entry, index) => {
    keyedEntries[entry.key] = {
      index,
      type: entry.type,
    };
  });

  const fallbackEntry =
    rest === undefined ? undefined : { index: -1, type: rest };

  return function (obj, flags) {
    let copied = false;
    let output = obj;
    let issues: IssueTree | undefined;
    let unrecognized: Key[] | undefined = undefined;
    let seenBits: BitSet = 0;
    let seenCount = 0;

    if (
      flags & FLAG_FORBID_EXTRA_KEYS ||
      flags & FLAG_STRIP_EXTRA_KEYS ||
      fallbackEntry !== undefined
    ) {
      for (const key in obj) {
        const entry = keyedEntries[key] ?? fallbackEntry;
        if (entry === undefined) {
          if (flags & FLAG_FORBID_EXTRA_KEYS) {
            if (unrecognized === undefined) {
              unrecognized = [key];
            } else {
              unrecognized.push(key);
            }
          } else if (
            flags & FLAG_STRIP_EXTRA_KEYS &&
            issues === undefined &&
            !copied
          ) {
            output = {};
            copied = true;
            for (let m = 0; m < indexedEntries.length; m++) {
              if (getBit(seenBits, m)) {
                const k = indexedEntries[m].key;
                set(output, k, obj[k]);
              }
            }
          }
          continue;
        }

        const value = obj[key];
        const r = entry.type.func(value, flags);
        if (r === undefined) {
          if (copied && issues === undefined) {
            set(output, key, value);
          }
        } else if (!r.ok) {
          issues = joinIssues(issues, prependPath(key, r));
        } else if (issues === undefined) {
          if (!copied) {
            output = {};
            copied = true;
            if (fallbackEntry === undefined) {
              for (let m = 0; m < indexedEntries.length; m++) {
                if (getBit(seenBits, m)) {
                  const k = indexedEntries[m].key;
                  set(output, k, obj[k]);
                }
              }
            } else {
              for (const k in obj) {
                set(output, k, obj[k]);
              }
            }
          }
          set(output, key, r.value);
        }

        if (entry.index >= 0) {
          seenCount++;
          seenBits = setBit(seenBits, entry.index);
        }
      }
    }

    if (seenCount < indexedEntries.length) {
      for (let i = 0; i < indexedEntries.length; i++) {
        if (getBit(seenBits, i)) {
          continue;
        }
        const entry = indexedEntries[i];
        const value = obj[entry.key];

        let keyFlags = flags & ~FLAG_MISSING_VALUE;
        if (value === undefined && !(entry.key in obj)) {
          if (!entry.optional) {
            issues = joinIssues(issues, entry.missing);
            continue;
          }
          keyFlags |= FLAG_MISSING_VALUE;
        }

        const r = entry.type.func(value, keyFlags);
        if (r === undefined) {
          if (
            copied &&
            issues === undefined &&
            !(keyFlags & FLAG_MISSING_VALUE)
          ) {
            set(output, entry.key, value);
          }
        } else if (!r.ok) {
          issues = joinIssues(issues, prependPath(entry.key, r));
        } else if (issues === undefined) {
          if (!copied) {
            output = {};
            copied = true;
            if (fallbackEntry === undefined) {
              for (let m = 0; m < indexedEntries.length; m++) {
                if (m < i || getBit(seenBits, m)) {
                  const k = indexedEntries[m].key;
                  set(output, k, obj[k]);
                }
              }
            } else {
              for (const k in obj) {
                set(output, k, obj[k]);
              }
              for (let m = 0; m < i; m++) {
                if (!getBit(seenBits, m)) {
                  const k = indexedEntries[m].key;
                  set(output, k, obj[k]);
                }
              }
            }
          }
          set(output, entry.key, r.value);
        }
      }
    }

    if (unrecognized !== undefined) {
      issues = joinIssues(issues, {
        ok: false,
        code: "unrecognized_keys",
        keys: unrecognized,
      });
    }

    if (issues === undefined && checks !== undefined) {
      for (let i = 0; i < checks.length; i++) {
        if (!checks[i].func(output)) {
          return checks[i].issue;
        }
      }
    }

    if (issues === undefined && copied) {
      return { ok: true, value: output };
    } else {
      return issues;
    }
  };
}

type TupleOutput<T extends Type[]> = {
  [K in keyof T]: T[K] extends Type<infer U> ? U : never;
};

type ArrayOutput<
  Head extends Type[],
  Rest extends Type | undefined,
  Tail extends Type[],
> = [
  ...TupleOutput<Head>,
  ...(Rest extends Type ? Infer<Rest>[] : []),
  ...TupleOutput<Tail>,
];

class ArrayOrTupleType<
  Head extends Type[] = Type[],
  Rest extends Type | undefined = Type | undefined,
  Tail extends Type[] = Type[],
> extends Type<ArrayOutput<Head, Rest, Tail>> {
  readonly name = "array";

  private readonly restType: Type;
  private readonly invalidType: IssueLeaf;
  private readonly invalidLength: IssueLeaf;
  private readonly minLength: number;
  private readonly maxLength: number | undefined;

  constructor(
    readonly prefix: Head,
    readonly rest: Rest | undefined,
    readonly suffix: Tail,
  ) {
    super();

    this.restType = rest ?? never();
    this.minLength = this.prefix.length + this.suffix.length;
    this.maxLength = rest ? undefined : this.minLength;
    this.invalidType = {
      ok: false,
      code: "invalid_type",
      expected: ["array"],
    };
    this.invalidLength = {
      ok: false,
      code: "invalid_length",
      minLength: this.minLength,
      maxLength: this.maxLength,
    };
  }

  func(arr: unknown, flags: number): RawResult<ArrayOutput<Head, Rest, Tail>> {
    if (!Array.isArray(arr)) {
      return this.invalidType;
    }

    const length = arr.length;
    const minLength = this.minLength;
    const maxLength = this.maxLength ?? Infinity;
    if (length < minLength || length > maxLength) {
      return this.invalidLength;
    }

    const headEnd = this.prefix.length;
    const tailStart = arr.length - this.suffix.length;

    let issueTree: IssueTree | undefined = undefined;
    let output: unknown[] = arr;
    for (let i = 0; i < arr.length; i++) {
      const type =
        i < headEnd
          ? this.prefix[i]
          : i >= tailStart
            ? this.suffix[i - tailStart]
            : this.restType;
      const r = type.func(arr[i], flags);
      if (r !== undefined) {
        if (r.ok) {
          if (output === arr) {
            output = arr.slice();
          }
          output[i] = r.value;
        } else {
          issueTree = joinIssues(issueTree, prependPath(i, r));
        }
      }
    }
    if (issueTree) {
      return issueTree;
    } else if (arr === output) {
      return undefined;
    } else {
      return { ok: true, value: output as ArrayOutput<Head, Rest, Tail> };
    }
  }

  concat(type: ArrayType | TupleType | VariadicTupleType): ArrayOrTupleType {
    if (this.rest) {
      if (type.rest) {
        throw new TypeError("can not concatenate two variadic types");
      }
      return new ArrayOrTupleType(this.prefix, this.rest, [
        ...this.suffix,
        ...type.prefix,
        ...type.suffix,
      ]);
    } else if (type.rest) {
      return new ArrayOrTupleType(
        [...this.prefix, ...this.suffix, ...type.prefix],
        type.rest,
        type.suffix,
      );
    } else {
      return new ArrayOrTupleType(
        [...this.prefix, ...this.suffix, ...type.prefix, ...type.suffix],
        type.rest,
        type.suffix,
      );
    }
  }
}

/**
 * A validator for arbitrary-length array types like `T[]`.
 */
interface ArrayType<Element extends Type = Type>
  extends Type<Infer<Element>[]> {
  readonly name: "array";
  readonly prefix: Type[];
  readonly rest: Element;
  readonly suffix: Type[];

  concat<Suffix extends Type[]>(
    type: TupleType<Suffix>,
  ): VariadicTupleType<[], Element, Suffix>;
}

/**
 * A validator for a fixed-length tuple type like `[]`, `[T1, T2]`
 * or `[T1, T2, ..., Tn]`.
 */
interface TupleType<Elements extends Type[] = Type[]>
  extends Type<TupleOutput<Elements>> {
  readonly name: "array";
  readonly prefix: Elements;
  readonly rest: undefined;
  readonly suffix: Type[];

  concat<ConcatPrefix extends Type[]>(
    type: TupleType<ConcatPrefix>,
  ): TupleType<[...Elements, ...ConcatPrefix]>;
  concat<
    ConcatPrefix extends Type[],
    Rest extends Type | undefined,
    Suffix extends Type[],
  >(
    type: VariadicTupleType<ConcatPrefix, Rest, Suffix>,
  ): VariadicTupleType<[...Elements, ...ConcatPrefix], Rest, Suffix>;
  concat<Element extends Type>(
    type: ArrayType<Element>,
  ): VariadicTupleType<Elements, Element, []>;
}

/**
 * A validator for a variadic tuple type like `[T1, ...T[], Tn]`,
 * `[...T[], Tn-1, Tn]` or `[T1, T2, ...T[]]`.
 */
interface VariadicTupleType<
  Prefix extends Type[] = Type[],
  Rest extends Type | undefined = undefined,
  Suffix extends Type[] = Type[],
> extends Type<ArrayOutput<Prefix, Rest, Suffix>> {
  readonly name: "array";
  readonly prefix: Prefix;
  readonly rest: Rest;
  readonly suffix: Suffix;

  concat<OtherPrefix extends Type[]>(
    type: TupleType<OtherPrefix>,
  ): VariadicTupleType<Prefix, Rest, [...Suffix, ...OtherPrefix]>;
}

function toInputType(v: unknown): InputType {
  const type = typeof v;
  if (type !== "object") {
    return type as InputType;
  } else if (v === null) {
    return "null";
  } else if (Array.isArray(v)) {
    return "array";
  } else {
    return type;
  }
}

function dedup<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function findCommonKeys(rs: ObjectShape[]): string[] {
  const map = new Map<string, number>();
  rs.forEach((r) => {
    for (const key in r) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  });
  const result = [] as string[];
  map.forEach((count, key) => {
    if (count === rs.length) {
      result.push(key);
    }
  });
  return result;
}

function groupTerminals(
  terminals: { root: AbstractType; terminal: TerminalType }[],
): {
  types: Map<InputType, AbstractType[]>;
  literals: Map<unknown, AbstractType[]>;
  unknowns: AbstractType[];
  optionals: AbstractType[];
  expectedTypes: InputType[];
} {
  const order = new Map<AbstractType, number>();
  const literals = new Map<unknown, AbstractType[]>();
  const types = new Map<InputType, AbstractType[]>();
  const unknowns = [] as AbstractType[];
  const optionals = [] as AbstractType[];
  const expectedTypes = [] as InputType[];
  terminals.forEach(({ root, terminal }) => {
    order.set(root, order.get(root) ?? order.size);

    if (terminal.name === "never") {
      // skip
    } else if (terminal.name === "optional") {
      optionals.push(root);
    } else if (terminal.name === "unknown") {
      unknowns.push(root);
    } else if (terminal.name === "literal") {
      const roots = literals.get(terminal.value) ?? [];
      roots.push(root);
      literals.set(terminal.value, roots);
      expectedTypes.push(toInputType(terminal.value));
    } else {
      const roots = types.get(terminal.name) ?? [];
      roots.push(root);
      types.set(terminal.name, roots);
      expectedTypes.push(terminal.name);
    }
  });

  literals.forEach((roots, value) => {
    const options = types.get(toInputType(value));
    if (options) {
      options.push(...roots);
      literals.delete(value);
    }
  });

  const byOrder = (a: AbstractType, b: AbstractType): number => {
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  };
  types.forEach((roots, type) =>
    types.set(type, dedup(roots.concat(unknowns).sort(byOrder))),
  );
  literals.forEach((roots, value) =>
    literals.set(value, dedup(roots.concat(unknowns)).sort(byOrder)),
  );
  return {
    types,
    literals,
    unknowns: dedup(unknowns).sort(byOrder),
    optionals: dedup(optionals).sort(byOrder),
    expectedTypes: dedup(expectedTypes),
  };
}

function createObjectKeyMatcher(
  objects: { root: AbstractType; terminal: ObjectType }[],
  key: string,
): Func<unknown> | undefined {
  const list: { root: AbstractType; terminal: TerminalType }[] = [];
  for (const { root, terminal } of objects) {
    terminal.shape[key].toTerminals((t) => list.push({ root, terminal: t }));
  }

  const { types, literals, optionals, unknowns, expectedTypes } =
    groupTerminals(list);
  if (unknowns.length > 0 || optionals.length > 1) {
    return undefined;
  }
  for (const roots of literals.values()) {
    if (roots.length > 1) {
      return undefined;
    }
  }
  for (const roots of types.values()) {
    if (roots.length > 1) {
      return undefined;
    }
  }

  const missingValue = prependPath(key, { ok: false, code: "missing_value" });
  const issue = prependPath(
    key,
    types.size === 0
      ? {
          ok: false,
          code: "invalid_literal",
          expected: Array.from(literals.keys()) as Literal[],
        }
      : {
          ok: false,
          code: "invalid_type",
          expected: expectedTypes,
        },
  );

  const litMap =
    literals.size > 0 ? new Map<unknown, AbstractType>() : undefined;
  for (const [literal, options] of literals) {
    litMap!.set(literal, options[0]);
  }
  const byType =
    types.size > 0 ? ({} as Record<string, AbstractType>) : undefined;
  for (const [type, options] of types) {
    byType![type] = options[0];
  }

  return function (_obj: unknown, flags: number) {
    const obj = _obj as Record<string, unknown>;
    const value = obj[key];
    if (value === undefined && !(key in obj)) {
      return optionals.length > 0
        ? optionals[0].func(obj, flags)
        : missingValue;
    }
    const option = byType?.[toInputType(value)] ?? litMap?.get(value);
    return option ? option.func(obj, flags) : issue;
  };
}

function createUnionObjectMatcher(
  terminals: { root: AbstractType; terminal: TerminalType }[],
): Func<unknown> | undefined {
  if (terminals.some(({ terminal: t }) => t.name === "unknown")) {
    return undefined;
  }

  const objects = terminals.filter(
    (item): item is { root: AbstractType; terminal: ObjectType } => {
      return item.terminal.name === "object";
    },
  );
  if (objects.length < 2) {
    return undefined;
  }

  const shapes = objects.map(({ terminal }) => terminal.shape);
  for (const key of findCommonKeys(shapes)) {
    const matcher = createObjectKeyMatcher(objects, key);
    if (matcher) {
      return matcher;
    }
  }
  return undefined;
}

function createUnionBaseMatcher(
  terminals: { root: AbstractType; terminal: TerminalType }[],
): Func<unknown> {
  const { expectedTypes, literals, types, unknowns, optionals } =
    groupTerminals(terminals);

  const issue: IssueLeaf =
    types.size === 0 && unknowns.length === 0
      ? {
          ok: false,
          code: "invalid_literal",
          expected: Array.from(literals.keys()) as Literal[],
        }
      : {
          ok: false,
          code: "invalid_type",
          expected: expectedTypes,
        };

  const litMap = literals.size > 0 ? literals : undefined;
  const byType =
    types.size > 0 ? ({} as Record<string, AbstractType[]>) : undefined;
  for (const [type, options] of types) {
    byType![type] = options;
  }

  return function (value: unknown, flags: number) {
    const options =
      flags & FLAG_MISSING_VALUE
        ? optionals
        : (byType?.[toInputType(value)] ?? litMap?.get(value) ?? unknowns);

    let count = 0;
    let issueTree: IssueTree = issue;
    for (let i = 0; i < options.length; i++) {
      const r = options[i].func(value, flags);
      if (r === undefined || r.ok) {
        return r;
      }
      issueTree = count > 0 ? joinIssues(issueTree, r) : r;
      count++;
    }
    if (count > 1) {
      return { ok: false, code: "invalid_union", tree: issueTree };
    }
    return issueTree;
  };
}

class UnionType<T extends Type[] = Type[]> extends Type<Infer<T[number]>> {
  readonly name = "union";
  private _func?: Func<Infer<T[number]>>;

  constructor(readonly options: T) {
    super();
  }

  toTerminals(func: (t: TerminalType) => void): void {
    this.options.forEach((o) => {
      o.toTerminals(func);
    });
  }

  func(v: unknown, flags: number): RawResult<Infer<T[number]>> {
    let func = this._func;
    if (func === undefined) {
      const flattened: { root: AbstractType; terminal: TerminalType }[] = [];
      this.options.forEach((option) => {
        option.toTerminals((terminal) => {
          flattened.push({ root: option, terminal });
        });
      });
      const base = createUnionBaseMatcher(flattened);
      const object = createUnionObjectMatcher(flattened);
      if (!object) {
        func = base as Func<Infer<T[number]>>;
      } else {
        func = function (v, f) {
          if (isObject(v)) {
            return object(v, f) as RawResult<Infer<T[number]>>;
          }
          return base(v, f) as RawResult<Infer<T[number]>>;
        };
      }
      this._func = func;
    }
    return func(v, flags);
  }
}

type TransformFunc = (
  value: unknown,
  options: ParseOptions,
) => RawResult<unknown>;

const STRICT = Object.freeze({ mode: "strict" }) as ParseOptions;
const STRIP = Object.freeze({ mode: "strip" }) as ParseOptions;
const PASSTHROUGH = Object.freeze({ mode: "passthrough" }) as ParseOptions;

class TransformType<Output> extends Type<Output> {
  readonly name = "transform";

  private transformChain?: TransformFunc[];
  private transformRoot?: AbstractType;
  private readonly undef = ok(undefined);

  constructor(
    protected readonly transformed: AbstractType,
    protected readonly transform: TransformFunc,
  ) {
    super();
    this.transformChain = undefined;
    this.transformRoot = undefined;
  }

  func(v: unknown, flags: number): RawResult<Output> {
    let chain = this.transformChain;
    if (!chain) {
      chain = [];

      // eslint-disable-next-line @typescript-eslint/no-this-alias
      let next: AbstractType = this;
      while (next instanceof TransformType) {
        chain.push(next.transform);
        next = next.transformed;
      }
      chain.reverse();
      this.transformChain = chain;
      this.transformRoot = next;
    }

    let result = this.transformRoot!.func(v, flags);
    if (result !== undefined && !result.ok) {
      return result;
    }

    let current: unknown;
    if (result !== undefined) {
      current = result.value;
    } else if (flags & FLAG_MISSING_VALUE) {
      current = undefined;
      result = this.undef;
    } else {
      current = v;
    }

    const options =
      flags & FLAG_FORBID_EXTRA_KEYS
        ? STRICT
        : flags & FLAG_STRIP_EXTRA_KEYS
          ? STRIP
          : PASSTHROUGH;
    for (let i = 0; i < chain.length; i++) {
      const r = chain[i](current, options);
      if (r !== undefined) {
        if (!r.ok) {
          return r;
        }
        current = r.value;
        result = r;
      }
    }
    return result as RawResult<Output>;
  }

  toTerminals(func: (t: TerminalType) => void): void {
    this.transformed.toTerminals(func);
  }
}
class LazyType<T> extends Type<T> {
  readonly name = "lazy";

  private recursing = false;
  private type?: Type<T>;

  constructor(private readonly definer: () => Type<T>) {
    super();
  }

  func(v: unknown, flags: number): RawResult<T> {
    if (!this.type) {
      this.type = this.definer();
    }
    return this.type.func(v, flags);
  }

  toTerminals(func: (t: TerminalType) => void): void {
    if (this.recursing) {
      return;
    }
    try {
      this.recursing = true;
      if (!this.type) {
        this.type = this.definer();
      }
      this.type.toTerminals(func);
    } finally {
      this.recursing = false;
    }
  }
}

class NeverType extends Type<never> {
  readonly name = "never";
  private readonly issue: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: [],
  };
  func(_: unknown, __: number): RawResult<never> {
    return this.issue;
  }
}
const neverSingleton = new NeverType();

/**
 * Create a validator that never matches any value,
 * analogous to the TypeScript type `never`.
 */
function never(): Type<never> {
  return neverSingleton;
}

class UnknownType extends Type {
  readonly name = "unknown";
  func(_: unknown, __: number): RawResult<unknown> {
    return undefined;
  }
}
const unknownSingleton = new UnknownType();

/**
 * Create a validator that matches any value,
 * analogous to the TypeScript type `unknown`.
 */
function unknown(): Type {
  return unknownSingleton;
}

class UndefinedType extends Type<undefined> {
  readonly name = "undefined";
  private readonly issue: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: ["undefined"],
  };
  func(v: unknown, _: number): RawResult<undefined> {
    return v === undefined ? undefined : this.issue;
  }
}
const undefinedSingleton = new UndefinedType();

/**
 * Create a validator that matches `undefined`.
 */
function undefined_(): Type<undefined> {
  return undefinedSingleton;
}

class NullType extends Type<null> {
  readonly name = "null";
  private readonly issue: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: ["null"],
  };
  func(v: unknown, _: number): RawResult<null> {
    return v === null ? undefined : this.issue;
  }
}
const nullSingleton = new NullType();

/**
 * Create a validator that matches `null`.
 */
function null_(): Type<null> {
  return nullSingleton;
}

class NumberType extends Type<number> {
  readonly name = "number";
  private readonly issue: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: ["number"],
  };
  func(v: unknown, _: number): RawResult<number> {
    return typeof v === "number" ? undefined : this.issue;
  }
}
const numberSingleton = new NumberType();

/**
 * Create a validator that matches any number value.
 */
function number(): Type<number> {
  return numberSingleton;
}

class BigIntType extends Type<bigint> {
  readonly name = "bigint";
  private readonly issue: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: ["bigint"],
  };
  func(v: unknown, _: number): RawResult<bigint> {
    return typeof v === "bigint" ? undefined : this.issue;
  }
}
const bigintSingleton = new BigIntType();

/**
 * Create a validator that matches any bigint value.
 */
function bigint(): Type<bigint> {
  return bigintSingleton;
}

class StringType extends Type<string> {
  readonly name = "string";
  private readonly issue: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: ["string"],
  };
  func(v: unknown, _: number): RawResult<string> {
    return typeof v === "string" ? undefined : this.issue;
  }
}
const stringSingleton = new StringType();

/**
 * Create a validator that matches any string value.
 */
function string(): Type<string> {
  return stringSingleton;
}

class BooleanType extends Type<boolean> {
  readonly name = "boolean";
  private readonly issue: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: ["boolean"],
  };
  func(v: unknown, _: number): RawResult<boolean> {
    return typeof v === "boolean" ? undefined : this.issue;
  }
}
const booleanSingleton = new BooleanType();

/**
 * Create a validator that matches any boolean value.
 */
function boolean(): Type<boolean> {
  return booleanSingleton;
}

class LiteralType<Out extends Literal = Literal> extends Type<Out> {
  readonly name = "literal";
  private readonly issue: IssueLeaf;
  constructor(readonly value: Out) {
    super();
    this.issue = {
      ok: false,
      code: "invalid_literal",
      expected: [value],
    };
  }
  func(v: unknown, _: number): RawResult<Out> {
    return v === this.value ? undefined : this.issue;
  }
}

/**
 * Create a validator for a specific string, number, bigint or boolean value.
 */
function literal<T extends Literal>(value: T): Type<T> {
  return new LiteralType(value);
}

/**
 * Create a validator for an object type.
 */
function object<T extends Record<string, AbstractType>>(
  obj: T,
): ObjectType<T, undefined> {
  return new ObjectType(obj, undefined);
}

/**
 * Create a validator for a record type `Record<string, T>`,
 * where `T` is the output type of the given subvalidator.
 */
function record<T extends Type>(valueType?: T): Type<Record<string, Infer<T>>> {
  return new ObjectType({}, valueType ?? unknown()) as Type<
    Record<string, Infer<T>>
  >;
}

/**
 * Create a validator for an array type `T[]`,
 * where `T` is the output type of the given subvalidator.
 */
function array<T extends Type>(item?: T): ArrayType<T> {
  return new ArrayOrTupleType(
    [],
    item ?? unknown(),
    [],
  ) as unknown as ArrayType<T>;
}

/**
 * Create a validator for an array type `[T1, T2, ..., Tn]`,
 * where `T1`, `T2`, ..., `Tn` are the output types of the given subvalidators.
 */
function tuple<T extends [] | [Type, ...Type[]]>(items: T): TupleType<T> {
  return new ArrayOrTupleType(items, undefined, []) as unknown as TupleType<T>;
}

/**
 * Create a validator that matches any type `T1 | T2 | ... | Tn`,
 * where `T1`, `T2`, ..., `Tn` are the output types of the given subvalidators.
 *
 * This is analogous to how TypeScript's union types are constructed.
 */
function union<T extends Type[]>(...options: T): UnionType<T> {
  return new UnionType(options);
}

/**
 * Create a validator that can reference itself, directly or indirectly.
 *
 * In most cases an explicit type annotation is also needed, as TypeScript
 * cannot infer return types of recursive functions.
 *
 * @example
 * ```ts
 * import * as v from "@badrap/valita";
 *
 * type T = string | T[];
 * const type: v.Type<T> = v.lazy(() => v.union(v.string(), v.array(type)));
 * ```
 */
function lazy<T>(definer: () => Type<T>): Type<T> {
  return new LazyType(definer);
}

type TerminalType =
  | NeverType
  | UnknownType
  | StringType
  | NumberType
  | BigIntType
  | BooleanType
  | UndefinedType
  | NullType
  | ObjectType
  | ArrayOrTupleType
  | LiteralType
  | Optional;

export {
  never,
  unknown,
  number,
  bigint,
  string,
  boolean,
  object,
  record,
  array,
  tuple,
  literal,
  union,
  null_ as null,
  undefined_ as undefined,
  lazy,
  ok,
  err,
};

export type { Type, Optional };
export type { ObjectType, ArrayType, TupleType, VariadicTupleType, UnionType };
