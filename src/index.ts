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
  | {
      ok: false;
      code: "custom_error";
      path: Key[] | undefined;
      message: string;
      error: CustomError;
    }
  | { ok: false; code: "invalid_type"; message: string; expected: InputType[] }
  | { ok: false; code: "missing_value"; message: string }
  | { ok: false; code: "invalid_literal"; message: string; expected: Literal[] }
  | { ok: false; code: "unrecognized_keys"; message: string; keys: Key[] }
  | { ok: false; code: "invalid_union"; message: string; tree: IssueTree }
  | {
      ok: false;
      code: "invalid_length";
      message: string;
      minLength: number;
      maxLength: number | undefined;
    }
>;

function customError(error: CustomError): IssueLeaf {
  return {
    ok: false,
    code: "custom_error",
    path: typeof error === "object" ? error.path : undefined,
    message:
      typeof error === "string"
        ? error
        : (error?.message ?? "validation failed"),
    error,
  };
}

function expectedType(expected: InputType[]): IssueLeaf {
  return {
    ok: false,
    code: "invalid_type",
    message: `expected ${separatedList(expected, "or")}`,
    expected,
  };
}

function expectedLiteral(literals: Literal[]): IssueLeaf {
  return {
    ok: false,
    code: "invalid_literal",
    message: `expected ${separatedList(literals.map(formatLiteral), "or")}`,
    expected: literals,
  };
}

class UnrecognizedKeysIssue {
  readonly ok = false;
  readonly code = "unrecognized_keys";
  readonly keys: Key[];

  constructor(keys: Key[]) {
    this.keys = keys;
  }

  get message() {
    const keys = this.keys;
    if (keys.length === 1) {
      return `unrecognized key ${formatLiteral(keys[0])}`;
    } else if (keys.length < 8) {
      return `unrecognized keys ${separatedList(keys.map(formatLiteral), "and")}`;
    } else {
      return `unrecognized keys ${keys.map(formatLiteral).join(",")} and ${keys.length - 6} others`;
    }
  }
}

function unrecognizedKeys(keys: Key[]): IssueLeaf {
  return new UnrecognizedKeysIssue(keys);
}

function invalidUnion(tree: IssueTree): IssueLeaf {
  return {
    ok: false,
    code: "invalid_union",
    message: "validation failed",
    tree,
  };
}

const ISSUE_EXPECTED_NOTHING = expectedType([]);
const ISSUE_EXPECTED_STRING = expectedType(["string"]);
const ISSUE_EXPECTED_NUMBER = expectedType(["number"]);
const ISSUE_EXPECTED_BIGINT = expectedType(["bigint"]);
const ISSUE_EXPECTED_BOOLEAN = expectedType(["boolean"]);
const ISSUE_EXPECTED_UNDEFINED = expectedType(["undefined"]);
const ISSUE_EXPECTED_NULL = expectedType(["null"]);
const ISSUE_EXPECTED_OBJECT = expectedType(["object"]);
const ISSUE_EXPECTED_ARRAY = expectedType(["array"]);
const ISSUE_MISSING_VALUE: IssueLeaf = {
  ok: false,
  code: "missing_value",
  message: "missing value",
};

type IssueTree =
  | Readonly<{
      ok: false;
      code: "prepend";
      key: Key;
      tree: IssueTree;
    }>
  | Readonly<{
      ok: false;
      code: "join";
      left: IssueTree;
      right: IssueTree;
    }>
  | IssueLeaf;

type Issue = Readonly<
  | {
      path: Key[];
      message: string;
      code: "custom_error";
    }
  | {
      path: Key[];
      message: string;
      code: "invalid_type";
      expected: InputType[];
    }
  | {
      path: Key[];
      message: string;
      code: "missing_value";
    }
  | {
      path: Key[];
      message: string;
      code: "invalid_literal";
      expected: Literal[];
    }
  | {
      path: Key[];
      message: string;
      code: "unrecognized_keys";
      keys: Key[];
    }
  | {
      path: Key[];
      message: string;
      code: "invalid_union";
      issues: [Issue, ...Issue[]];
    }
  | {
      path: Key[];
      message: string;
      code: "invalid_length";
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
      return {
        path,
        message: tree.message,
        code,
        expected: tree.expected,
      };
    case "invalid_literal":
      return {
        path,
        message: tree.message,
        code,
        expected: tree.expected,
      };
    case "missing_value":
      return {
        path,
        message: tree.message,
        code,
      };
    case "invalid_length": {
      return {
        path,
        message: tree.message,
        code,
        minLength: tree.minLength,
        maxLength: tree.maxLength,
      };
    }
    case "unrecognized_keys": {
      return {
        path,
        message: tree.message,
        code,
        keys: tree.keys,
      };
    }
    case "invalid_union":
      return {
        code,
        path,
        message: tree.message,
        issues: collectIssues(tree.tree),
      };
    case "custom_error":
      if (tree.path !== undefined) {
        path.push(...tree.path);
      }
      return {
        path,
        message: tree.message,
        code,
      };
  }
}

function collectIssues(
  tree: IssueTree,
  path: Key[] = [],
  issues: Issue[] = [],
): [Issue, ...Issue[]] {
  for (;;) {
    if (tree.code === "join") {
      collectIssues(tree.left, path.slice(), issues);
      tree = tree.right;
    } else if (tree.code === "prepend") {
      path.push(tree.key);
      tree = tree.tree;
    } else {
      issues.push(cloneIssueWithPath(tree, path));
      return issues as [Issue, ...Issue[]];
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

  if (tree.code === "custom_error" && tree.path) {
    path += "." + tree.path.join(".");
  }

  let msg = `${tree.code} at ${path || "."} (${tree.message})`;
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
  readonly #issueTree: IssueTree;

  #issues: [Issue, ...Issue[]] | undefined;
  #message: string | undefined;

  constructor(issueTree: IssueTree) {
    super();
    this.#issueTree = issueTree;
  }

  get issues(): readonly [Issue, ...Issue[]] {
    return (this.#issues ??= collectIssues(this.#issueTree));
  }

  get message(): string {
    return (this.#message ??= formatIssueTree(this.#issueTree));
  }
}
ValitaError.prototype.name = "ValitaError";

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

  /**
   * The non-existent issues.
   */
  readonly issues?: undefined;
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
  readonly issues: readonly [Issue, ...Issue[]];

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

class OkImpl<T> {
  readonly ok = true;
  readonly value: T;
  declare issues: undefined;

  static {
    this.prototype.issues = undefined;
  }

  constructor(value: T) {
    this.value = value;
  }
}

class ErrImpl implements Err {
  readonly ok = false;

  /** @internal */
  private readonly _issueTree: IssueTree;

  #message: string | undefined;
  #issues: [Issue, ...Issue[]] | undefined;

  constructor(issueTree: IssueTree) {
    this._issueTree = issueTree;
  }

  get issues(): readonly [Issue, ...Issue[]] {
    return (this.#issues ??= collectIssues(this._issueTree));
  }

  get message(): string {
    return (this.#message ??= formatIssueTree(this._issueTree));
  }

  throw(): never {
    throw new ValitaError(this._issueTree);
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
export function ok<T extends Literal>(value: T): Ok<T>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value: T): Ok<T> {
  return new OkImpl(value);
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
export function err(error?: CustomError): Err {
  return new ErrImpl(customError(error));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const FLAG_FORBID_EXTRA_KEYS = 1 << 0;
const FLAG_STRIP_EXTRA_KEYS = 1 << 1;
const FLAG_MISSING_VALUE = 1 << 2;

const TAG_UNKNOWN = 0;
const TAG_NEVER = 1;
const TAG_STRING = 2;
const TAG_NUMBER = 3;
const TAG_BIGINT = 4;
const TAG_BOOLEAN = 5;
const TAG_NULL = 6;
const TAG_UNDEFINED = 7;
const TAG_LITERAL = 8;
const TAG_OPTIONAL = 9;
const TAG_OBJECT = 10;
const TAG_ARRAY = 11;
const TAG_UNION = 12;
const TAG_SIMPLE_UNION = 13;
const TAG_TRANSFORM = 14;
const TAG_OTHER = 15;

type MatcherResult = undefined | Ok<unknown> | IssueTree;

type Matcher<Input = unknown> = (value: Input, flags: number) => MatcherResult;

type TaggedMatcher = { tag: number; match: Matcher };

const taggedMatcher = (tag: number, match: Matcher): TaggedMatcher => {
  return { tag, match };
};

function callMatcher(
  matcher: TaggedMatcher,
  value: unknown,
  flags: number,
): MatcherResult {
  switch (matcher.tag) {
    case TAG_UNKNOWN:
      return undefined;
    case TAG_NEVER:
      return ISSUE_EXPECTED_NOTHING;
    case TAG_STRING:
      return typeof value === "string" ? undefined : ISSUE_EXPECTED_STRING;
    case TAG_NUMBER:
      return typeof value === "number" ? undefined : ISSUE_EXPECTED_NUMBER;
    case TAG_BIGINT:
      return typeof value === "bigint" ? undefined : ISSUE_EXPECTED_BIGINT;
    case TAG_BOOLEAN:
      return typeof value === "boolean" ? undefined : ISSUE_EXPECTED_BOOLEAN;
    case TAG_NULL:
      return value === null ? undefined : ISSUE_EXPECTED_NULL;
    case TAG_UNDEFINED:
      return value === undefined ? undefined : ISSUE_EXPECTED_UNDEFINED;
    case TAG_LITERAL:
      return matcher.match(value, flags);
    case TAG_OPTIONAL:
      return matcher.match(value, flags);
    case TAG_OBJECT:
      return matcher.match(value, flags);
    case TAG_ARRAY:
      return matcher.match(value, flags);
    case TAG_UNION:
      return matcher.match(value, flags);
    case TAG_SIMPLE_UNION:
      return matcher.match(value, flags);
    case TAG_TRANSFORM:
      return matcher.match(value, flags);
    default:
      return matcher.match(value, flags);
  }
}

const MATCHER_SYMBOL: unique symbol = Symbol.for("@valita/internal");

export type ParseOptions = {
  mode?: "passthrough" | "strict" | "strip";
};

interface Parser<Output = unknown> {
  readonly name:
    | "optional"
    | "unknown"
    | "never"
    | "string"
    | "number"
    | "bigint"
    | "boolean"
    | "null"
    | "undefined"
    | "literal"
    | "object"
    | "array"
    | "union"
    | "lazy"
    | "transform";

  is(name: "unknown"): this is UnknownType;
  is(name: "never"): this is NeverType;
  is(name: "string"): this is StringType;
  is(name: "number"): this is NumberType;
  is(name: "bigint"): this is BigIntType;
  is(name: "boolean"): this is BooleanType;
  is(name: "null"): this is NullType;
  is(name: "undefined"): this is UndefinedType;
  is(name: "literal"): this is LiteralType;
  is(name: "object"): this is ObjectType;
  is(name: "array"): this is ArrayType | TupleType | VariadicTupleType;
  is(name: "union"): this is UnionType;
  is(name: "lazy"): this is LazyType;
  is(name: "transform"): this is TransformType;
  is(name: "optional"): this is Optional;

  readonly [MATCHER_SYMBOL]: TaggedMatcher;

  readonly "~standard": {
    readonly version: 1;
    readonly vendor: "@badrap/valita";
    readonly types?:
      | {
          readonly input: unknown;
          readonly output: Output;
        }
      | undefined;
    validate: (
      value: unknown,
      options?: { libraryOptions?: Record<string, unknown> | undefined },
    ) => ValitaResult<Output>;
  };

  /**
   * Parse a value without throwing.
   */
  try(v: unknown, options?: ParseOptions): ValitaResult<Output>;

  /**
   * Parse a value. Throw a ValitaError on failure.
   */
  parse(v: unknown, options?: ParseOptions): Output;

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
    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
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

  /**
   * Derive a new validator that uses the provided predicate function to
   * perform custom validation for the source validator's output values.
   *
   * The predicate function should return `true` when the source
   * type's output value is valid, `false` otherwise. The checked value
   * itself won't get modified or replaced, and is returned as-is on
   * validation success.
   *
   * @example A validator that accepts only numeric strings.
   * ```ts
   * const numericString = v.string().assert((s) => /^\d+$/.test(s))
   * numericString.parse("1");
   * // "1"
   * numericString.parse("foo");
   * // ValitaError: custom_error at . (validation failed)
   * ```
   *
   * You can also _refine_ the output type by passing in a
   * [type predicate](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates).
   * Note that the type predicate must have a compatible input type.
   *
   * @example A validator with its output type refined to `Date`.
   * ```ts
   * const dateType = v.unknown().assert((v): v is Date => v instanceof Date);
   * ```
   *
   * You can also pass in a custom failure messages.
   *
   * @example A validator that rejects non-integers with a custom error.
   * ```ts
   * const integer = v.number().assert((n) => Number.isInteger(n), "not an integer");
   * integer.parse(1);
   * // 1
   * integer.parse(1.5);
   * // ValitaError: custom_error at . (not an integer)
   * ```
   *
   * @param func - The assertion predicate function.
   * @param [error] - A custom error for situations when the assertion
   *                  predicate returns `false`.
   */
  assert<T extends Output>(
    func:
      | ((v: Output, options: ParseOptions) => v is T)
      | ((v: Output, options: ParseOptions) => boolean),
    error?: CustomError,
  ): Type<T>;

  /**
   * Derive a new validator that uses the provided mapping function to
   * perform custom mapping for the source validator's output values.
   *
   * The mapped value's type doesn't have to stay same, but mapping must
   * always succeed (i.e. not throw) for all values that the source validator
   * outputs.
   *
   * @example
   * ```ts
   * const stringLength = v.string().assert((s) => s.length);
   * stringLength.parse("Hello, World!");
   * // 13
   * stringLength.parse(1);
   * // ValitaError: invalid_type at . (expected string)
   * ```
   *
   * @param func - The mapping function.
   */
  map<T extends Literal>(
    func: (v: Output, options: ParseOptions) => T,
  ): Type<T>;
  map<T>(func: (v: Output, options: ParseOptions) => T): Type<T>;

  /**
   * Derive a new validator that uses the provided mapping function to
   * perform custom parsing for the source validator's output values.
   *
   * Unlike `.map`, `.chain` can also be used for cases where the
   * transformation might fail. If the transformation fails, return an error
   * with an optional message with `err(...)`. If not, then return the
   * transformed value with `ok(...)`.
   *
   * @example A parser for date strings, returns `Date` objects on success.
   * ```ts
   * const DateType = v.string().chain((s) => {
   *   const date = new Date(s);
   *   if (isNaN(+date)) {
   *     return v.err("invalid date");
   *   }
   *   return v.ok(date);
   * });
   *
   * Date.parse("2022-01-01");
   * // 2022-01-01T00:00:00.000Z
   * Date.parse("foo");
   * // ValitaError: custom_error at . (invalid date)
   * ```
   *
   * @param func - The parsing function.
   */
  chain<T extends Literal>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T>;
  chain<T>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T>;
  chain<T>(type: Type<T>): Type<T>;

  /**
   * Apply a function to this type and return its result.
   *
   * The function is called immediately with this type as its argument.
   *
   * Useful for applying reusable type modifiers.
   *
   * @example
   * ```ts
   * function nullish<T extends Type>() {
   *   return t.nullable().optional();
   * }
   *
   * const strings = v.string().as(nullish);
   * ```
   *
   * @param func - The function to apply to this type.
   * @returns The function's result.
   */
  as<T>(func: (type: this) => T): T;
}

abstract class ParserImpl<Output> implements Parser<Output> {
  abstract readonly name: Parser["name"];

  is(name: "unknown"): this is UnknownType;
  is(name: "never"): this is NeverType;
  is(name: "string"): this is StringType;
  is(name: "number"): this is NumberType;
  is(name: "bigint"): this is BigIntType;
  is(name: "boolean"): this is BooleanType;
  is(name: "null"): this is NullType;
  is(name: "undefined"): this is UndefinedType;
  is(name: "literal"): this is LiteralType;
  is(name: "object"): this is ObjectType;
  is(name: "array"): this is ArrayType | TupleType | VariadicTupleType;
  is(name: "union"): this is UnionType;
  is(name: "lazy"): this is LazyType;
  is(name: "transform"): this is TransformType;
  is(name: "optional"): this is Optional;
  is(name: string): boolean {
    return this.name === name;
  }

  abstract readonly [MATCHER_SYMBOL]: TaggedMatcher;

  #standard: (typeof this)["~standard"] | undefined;

  get "~standard"(): {
    readonly version: 1;
    readonly vendor: "@badrap/valita";
    readonly types?:
      | {
          readonly input: unknown;
          readonly output: Output;
        }
      | undefined;
    validate: (
      value: unknown,
      options?: { libraryOptions?: Record<string, unknown> | undefined },
    ) => ValitaResult<Output>;
  } {
    return (this.#standard ??= {
      version: 1,
      vendor: "@badrap/valita",
      validate: (value, options) => {
        return this.try(value, options?.libraryOptions);
      },
    });
  }

  #matcher: TaggedMatcher | undefined;

  try(v: unknown, options?: ParseOptions): ValitaResult<Output> {
    const r = callMatcher(
      (this.#matcher ??= this[MATCHER_SYMBOL]),
      v,
      options === undefined
        ? FLAG_FORBID_EXTRA_KEYS
        : options.mode === "strip"
          ? FLAG_STRIP_EXTRA_KEYS
          : options.mode === "passthrough"
            ? 0
            : FLAG_FORBID_EXTRA_KEYS,
    );
    return r === undefined || r.ok
      ? (new OkImpl(r === undefined ? v : r.value) as ValitaResult<Output>)
      : new ErrImpl(r);
  }

  parse(v: unknown, options?: ParseOptions): Output {
    const r = callMatcher(
      (this.#matcher ??= this[MATCHER_SYMBOL]),
      v,
      options === undefined
        ? FLAG_FORBID_EXTRA_KEYS
        : options.mode === "strip"
          ? FLAG_STRIP_EXTRA_KEYS
          : options.mode === "passthrough"
            ? 0
            : FLAG_FORBID_EXTRA_KEYS,
    );
    if (r === undefined || r.ok) {
      return (r === undefined ? v : r.value) as Output;
    }
    throw new ValitaError(r);
  }

  abstract optional<T extends Literal>(
    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, undefined> | T>;
  abstract optional(
    defaultFn: () => Exclude<Output, undefined>,
  ): Type<Exclude<Output, undefined>>;
  abstract optional<T>(
    defaultFn: () => T,
  ): Type<Exclude<Output, undefined> | T>;
  abstract optional(): Optional<Output>;

  assert<T extends Output>(
    func:
      | ((v: Output, options: ParseOptions) => v is T)
      | ((v: Output, options: ParseOptions) => boolean),
    error?: CustomError,
  ): Type<T> {
    const inner: Parser<Output> = this;
    const err = customError(error);
    return new TransformTypeImpl(inner, (v, flags) =>
      func(v as Output, flagsToOptions(flags)) ? undefined : err,
    );
  }

  map<T extends Literal>(
    func: (v: Output, options: ParseOptions) => T,
  ): Type<T>;
  map<T>(func: (v: Output, options: ParseOptions) => T): Type<T>;
  map<T>(func: (v: Output, options: ParseOptions) => T): Type<T> {
    const inner: Parser<Output> = this;
    return new TransformTypeImpl(inner, (v, flags) => ({
      ok: true,
      value: func(v as Output, flagsToOptions(flags)),
    }));
  }

  chain<T extends Literal>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T>;
  chain<T>(
    func: (v: Output, options: ParseOptions) => ValitaResult<T>,
  ): Type<T>;
  chain<T>(type: Type<T>): Type<T>;
  chain(
    input: Type | ((v: Output, options: ParseOptions) => ValitaResult<unknown>),
  ): Type {
    const inner: Parser<Output> = this;
    if (typeof input === "function") {
      return new TransformTypeImpl(inner, (v, flags) => {
        const r = input(v as Output, flagsToOptions(flags));
        return r.ok
          ? r
          : (r as unknown as { _issueTree: IssueTree })._issueTree;
      });
    }
    return new TransformTypeImpl(inner, (v, flags) =>
      callMatcher(input[MATCHER_SYMBOL], v, flags),
    );
  }

  as<T>(func: (type: this) => T): T {
    return func(this);
  }
}

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
export type Infer<T extends Parser> = NonNullable<
  T["~standard"]["types"]
>["output"];

interface Type<Output = unknown> extends Parser<Output> {
  readonly name: Exclude<Parser["name"], "optional">;

  /**
   * Return new validator that accepts both the original type and `null`.
   *
   * The optional `defaultFn` function, if provided, will be called each
   * time a `null` is parsed.
   *
   * @param [defaultFn] - An optional function returning the default value.
   */
  nullable<T extends Literal>(
    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, null> | T>;
  nullable(defaultFn: () => Exclude<Output, null>): Type<Exclude<Output, null>>;
  nullable<T>(defaultFn: () => T): Type<Exclude<Output, null> | T>;
  nullable(): UnionType<[Type<null>, this]>;
}

/**
 * A base class for all concrete validators/parsers.
 */
abstract class TypeImpl<Output = unknown>
  extends ParserImpl<Output>
  implements Type<Output>
{
  abstract name: Type["name"];

  optional<T extends Literal>(
    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, undefined> | T>;
  optional(
    defaultFn: () => Exclude<Output, undefined>,
  ): Type<Exclude<Output, undefined>>;
  optional<T>(defaultFn: () => T): Type<Exclude<Output, undefined> | T>;
  optional(): Optional<Output>;
  optional(defaultFn?: () => unknown): unknown {
    const optional: Optional<Output> = new OptionalImpl(this);
    if (!defaultFn) {
      return optional;
    }
    return new TransformTypeImpl(optional, (v) =>
      v === undefined ? { ok: true, value: defaultFn() } : undefined,
    );
  }

  nullable<T extends Literal>(
    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, null> | T>;
  nullable(defaultFn: () => Exclude<Output, null>): Type<Exclude<Output, null>>;
  nullable<T>(defaultFn: () => T): Type<Exclude<Output, null> | T>;
  nullable<This extends Type<Output>>(): UnionType<[Type<null>, This]>;
  nullable(this: Type<Output>, defaultFn?: () => unknown): unknown {
    const nullable: Type<Output | null> = new SimpleUnion([null_(), this]);
    if (!defaultFn) {
      return nullable;
    }
    return new TransformTypeImpl(nullable, (v) =>
      v === null ? { ok: true, value: defaultFn() } : undefined,
    );
  }
}

class SimpleUnion<Options extends Type[]> extends TypeImpl<
  Infer<Options[number]>
> {
  readonly name = "union";
  readonly options: Readonly<Options>;
  #matcher: TaggedMatcher | undefined;

  constructor(options: Readonly<Options>) {
    super();
    this.options = options;
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    if (this.#matcher !== undefined) {
      return this.#matcher;
    }

    const options = this.options.map((o) => o[MATCHER_SYMBOL]);
    return (this.#matcher ??= taggedMatcher(TAG_SIMPLE_UNION, (v, flags) => {
      let issue: IssueTree = ISSUE_EXPECTED_NOTHING;
      for (const option of options) {
        const result = callMatcher(option, v, flags);
        if (result === undefined || result.ok) {
          return result;
        }
        issue = result;
      }
      return issue;
    }));
  }
}

interface Optional<Output = unknown> extends Parser<Output | undefined> {
  readonly name: "optional";
  readonly inner: Type<Output>;

  /** Deprecated: use .inner */
  readonly type: Type<Output>;
}

/**
 * A validator/parser marked as "optional", signifying that their value can
 * be missing from the parsed object.
 *
 * As such optionals can only be used as property validators within
 * object validators.
 */
class OptionalImpl<Output = unknown>
  extends ParserImpl<Output | undefined>
  implements Optional<Output>
{
  readonly name = "optional";
  readonly inner: Type<Output>;
  #matcher: TaggedMatcher | undefined;

  /** Deprecated: use .inner */
  readonly type: Type<Output>;

  constructor(inner: Type<Output>) {
    super();
    this.inner = inner;
    this.type = inner;
  }

  optional<T extends Literal>(
    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
    defaultFn: <X extends T>() => X,
  ): Type<Exclude<Output, undefined> | T>;
  optional(
    defaultFn: () => Exclude<Output, undefined>,
  ): Type<Exclude<Output, undefined>>;
  optional<T>(defaultFn: () => T): Type<Exclude<Output, undefined> | T>;
  optional(): Optional<Output>;
  optional(defaultFn?: () => unknown): unknown {
    // If this type is already Optional there's no need to wrap it inside
    // a new Optional instance.
    if (!defaultFn) {
      return this;
    }
    const inner: Optional<Output> = this;
    return new TransformTypeImpl(inner, (v) =>
      v === undefined ? { ok: true, value: defaultFn() } : undefined,
    );
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    if (this.#matcher !== undefined) {
      return this.#matcher;
    }
    const matcher = this.type[MATCHER_SYMBOL];
    return (this.#matcher = taggedMatcher(TAG_OPTIONAL, (v, flags) =>
      v === undefined || flags & FLAG_MISSING_VALUE
        ? undefined
        : callMatcher(matcher, v, flags),
    ));
  }
}

type ObjectShape = Record<string, Parser>;

type ObjectOutput<
  T extends ObjectShape,
  R extends Parser | undefined,
> = PrettyIntersection<
  {
    [K in keyof T]?: T[K] extends Optional ? Infer<T[K]> : unknown;
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
    bits[idx] |= 1 << (index % 32);
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
    return (bits[index >> 5] >>> (index % 32)) & 1;
  }
}

interface ObjectType<
  Shape extends ObjectShape = ObjectShape,
  Rest extends Parser | undefined = Parser | undefined,
> extends Type<ObjectOutput<Shape, Rest>> {
  readonly name: "object";

  readonly shape: Shape;
  readonly restType: Rest;

  rest<R extends Type>(restType: R): ObjectType<Shape, R>;

  extend<S extends ObjectShape>(
    shape: S,
  ): ObjectType<Omit<Shape, keyof S> & S, Rest>;

  pick<K extends Array<string & keyof Shape>>(
    ...keys: K
  ): ObjectType<Pick<Shape, K[number]>, undefined>;

  omit<K extends Array<string & keyof Shape>>(
    ...keys: K
  ): ObjectType<Omit<Shape, K[number]>, Rest>;

  partial(): ObjectType<
    { [K in keyof Shape]: Optional<Infer<Shape[K]>> },
    Rest extends Parser<infer I> ? Optional<I> : undefined
  >;
}

class ObjectTypeImpl<
  Shape extends ObjectShape = ObjectShape,
  Rest extends Parser | undefined = Parser | undefined,
> extends TypeImpl<ObjectOutput<Shape, Rest>> {
  readonly name = "object";

  readonly shape: Shape;
  readonly restType: Rest;
  #matcher: TaggedMatcher | undefined;

  constructor(shape: Shape, restType: Rest) {
    super();
    this.shape = shape;
    this.restType = restType;
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    if (this.#matcher !== undefined) {
      return this.#matcher;
    }
    const func = createObjectMatcher(this.shape, this.restType);
    return (this.#matcher = taggedMatcher(TAG_OBJECT, (v, flags) =>
      isObject(v) ? func(v, flags) : ISSUE_EXPECTED_OBJECT,
    ));
  }

  rest<R extends Type>(restType: R): ObjectType<Shape, R> {
    return new ObjectTypeImpl(this.shape, restType);
  }

  extend<S extends ObjectShape>(
    shape: S,
  ): ObjectType<Omit<Shape, keyof S> & S, Rest> {
    return new ObjectTypeImpl(
      { ...this.shape, ...shape },
      this.restType,
    ) as ObjectType<Omit<Shape, keyof S> & S, Rest>;
  }

  pick<K extends Array<string & keyof Shape>>(
    ...keys: K
  ): ObjectType<Pick<Shape, K[number]>, undefined> {
    const shape = {} as Pick<Shape, K[number]>;
    for (const key of keys) {
      set(shape, key, this.shape[key]);
    }
    return new ObjectTypeImpl(shape, undefined);
  }

  omit<K extends Array<string & keyof Shape>>(
    ...keys: K
  ): ObjectType<Omit<Shape, K[number]>, Rest> {
    const shape = { ...this.shape };
    for (const key of keys) {
      delete shape[key];
    }
    return new ObjectTypeImpl(shape, this.restType) as ObjectType<
      Omit<Shape, K[number]>,
      Rest
    >;
  }

  partial(): ObjectType<
    { [K in keyof Shape]: Optional<Infer<Shape[K]>> },
    Rest extends Parser<infer I> ? Optional<I> : undefined
  > {
    const shape = {} as { [K in keyof Shape]: Optional<Infer<Shape[K]>> };
    for (const key of Object.keys(this.shape)) {
      set(shape, key, this.shape[key].optional());
    }
    const rest = this.restType?.optional() as Rest extends Parser<infer I>
      ? Optional<I>
      : undefined;
    return new ObjectTypeImpl(shape, rest);
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

const optionalInput = (t: Parser, seen = new Set<Parser>()): boolean => {
  if (t.is("lazy")) {
    if (seen.has(t)) {
      return false;
    }
    try {
      seen.add(t);
      return optionalInput(t.inner, seen);
    } finally {
      seen.delete(t);
    }
  } else if (t.is("transform")) {
    return optionalInput(t.inner, seen);
  } else if (t.is("union")) {
    for (const option of t.options) {
      if (optionalInput(option, seen)) {
        return true;
      }
    }
    return false;
  } else {
    return t.is("optional");
  }
};

function createObjectMatcher(
  shape: ObjectShape,
  rest?: Parser,
): Matcher<Record<string, unknown>> {
  type Entry = {
    key: string;
    index: number;
    matcher: TaggedMatcher;
    optional: boolean;
    missing: IssueTree;
  };

  const indexedEntries = Object.keys(shape).map((key, index) => {
    const type = shape[key];
    return {
      key,
      index,
      matcher: type[MATCHER_SYMBOL],
      optional: optionalInput(type),
      missing: prependPath(key, ISSUE_MISSING_VALUE),
    } satisfies Entry;
  });

  const keyedEntries = Object.create(null) as { [K in string]?: Entry };
  for (const entry of indexedEntries) {
    keyedEntries[entry.key] = entry;
  }

  const restMatcher = rest?.[MATCHER_SYMBOL];

  const clone = (
    obj: Record<string, unknown>,
    enumeratedBits: BitSet,
    indexedBits: BitSet,
  ) => {
    const output = {};

    if (restMatcher === undefined) {
      for (let m = 0; m < indexedEntries.length; m++) {
        if (getBit(enumeratedBits, m) || getBit(indexedBits, m)) {
          const k = indexedEntries[m].key;
          set(output, k, obj[k]);
        }
      }
      return output;
    }

    for (const k in obj) {
      set(output, k, obj[k]);
    }
    if (indexedBits) {
      for (let m = 0; m < indexedEntries.length; m++) {
        if (getBit(indexedBits, m)) {
          const k = indexedEntries[m].key;
          set(output, k, obj[k]);
        }
      }
    }
    return output;
  };

  // A fast path for record(unknown())
  const fastPath = indexedEntries.length === 0 && rest?.name === "unknown";

  return (obj, flags) => {
    if (fastPath) {
      return undefined;
    }

    let output: Record<string, unknown> | undefined = undefined;
    let issues: IssueTree | undefined = undefined;
    let unrecognized: Key[] | undefined = undefined;
    let enumeratedBits: BitSet = 0;
    let indexedBits: BitSet = 0;
    let seenCount = 0;

    if (
      flags & (FLAG_FORBID_EXTRA_KEYS | FLAG_STRIP_EXTRA_KEYS) ||
      restMatcher !== undefined
    ) {
      for (const key in obj) {
        const value = obj[key];

        const entry = keyedEntries[key];
        if (entry === undefined && restMatcher === undefined) {
          if (flags & FLAG_FORBID_EXTRA_KEYS) {
            if (unrecognized === undefined) {
              unrecognized = [key];
            } else {
              unrecognized.push(key);
            }
          } else if (
            flags & FLAG_STRIP_EXTRA_KEYS &&
            issues === undefined &&
            output === undefined
          ) {
            output = clone(obj, enumeratedBits, indexedBits);
          }
          continue;
        }

        const r =
          entry === undefined
            ? callMatcher(restMatcher!, value, flags)
            : callMatcher(entry.matcher, value, flags);
        if (r === undefined) {
          if (output !== undefined && issues === undefined) {
            set(output, key, value);
          }
        } else if (!r.ok) {
          issues = joinIssues(issues, prependPath(key, r));
        } else if (issues === undefined) {
          output ??= clone(obj, enumeratedBits, indexedBits);
          set(output, key, r.value);
        }

        if (entry !== undefined) {
          seenCount++;
          enumeratedBits = setBit(enumeratedBits, entry.index);
        }
      }
    }

    if (seenCount < indexedEntries.length) {
      for (let i = 0; i < indexedEntries.length; i++) {
        if (getBit(enumeratedBits, i)) {
          continue;
        }
        const entry = indexedEntries[i];
        const value = obj[entry.key];

        let extraFlags = 0;
        if (value === undefined && !(entry.key in obj)) {
          if (!entry.optional) {
            issues = joinIssues(issues, entry.missing);
            continue;
          }
          extraFlags = FLAG_MISSING_VALUE;
        }

        const r = callMatcher(entry.matcher, value, flags | extraFlags);
        if (r === undefined) {
          if (output !== undefined && issues === undefined && !extraFlags) {
            set(output, entry.key, value);
          }
        } else if (!r.ok) {
          issues = joinIssues(issues, prependPath(entry.key, r));
        } else if (issues === undefined) {
          output ??= clone(obj, enumeratedBits, indexedBits);
          set(output, entry.key, r.value);
        }

        if (extraFlags === 0) {
          indexedBits = setBit(indexedBits, i);
        }
      }
    }

    if (unrecognized !== undefined) {
      return joinIssues(issues, unrecognizedKeys(unrecognized));
    } else if (issues !== undefined) {
      return issues;
    } else {
      return output && { ok: true, value: output };
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
  ...(Rest extends Type ? Array<Infer<Rest>> : []),
  ...TupleOutput<Tail>,
];

class ArrayOrTupleType<
  Head extends Type[] = Type[],
  Rest extends Type | undefined = Type | undefined,
  Tail extends Type[] = Type[],
> extends TypeImpl<ArrayOutput<Head, Rest, Tail>> {
  readonly name = "array";

  readonly prefix: Head;
  readonly restType: Rest | undefined;
  readonly suffix: Tail;

  #matcher: TaggedMatcher | undefined;

  constructor(prefix: Head, rest: Rest | undefined, suffix: Tail) {
    super();
    this.prefix = prefix;
    this.restType = rest;
    this.suffix = suffix;
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    if (this.#matcher !== undefined) {
      return this.#matcher;
    }

    const prefix = this.prefix.map((t) => t[MATCHER_SYMBOL]);
    const suffix = this.suffix.map((t) => t[MATCHER_SYMBOL]);
    const rest =
      this.restType?.[MATCHER_SYMBOL] ??
      taggedMatcher(1, () => ISSUE_MISSING_VALUE);

    const minLength = prefix.length + suffix.length;
    const maxLength = this.restType ? Infinity : minLength;

    let message = `expected an array`;
    if (minLength > 0) {
      if (maxLength === minLength) {
        message += `with ${minLength === 1 ? "item" : "items"}`;
      } else if (maxLength < Infinity) {
        message += `with between ${minLength} and ${maxLength} items`;
      } else {
        message += `with at least ${minLength === 1 ? "item" : "items"}`;
      }
    } else if (maxLength < Infinity) {
      message += `with at most ${maxLength === 1 ? "item" : "items"}`;
    }

    const invalidLength: IssueLeaf = {
      ok: false,
      code: "invalid_length",
      message,
      minLength,
      maxLength: maxLength === Infinity ? undefined : maxLength,
    };

    return (this.#matcher = taggedMatcher(TAG_ARRAY, (arr, flags) => {
      if (!Array.isArray(arr)) {
        return ISSUE_EXPECTED_ARRAY;
      }

      const length = arr.length;
      if (length < minLength || length > maxLength) {
        return invalidLength;
      }

      const headEnd = prefix.length;
      const tailStart = arr.length - suffix.length;

      let issueTree: IssueTree | undefined = undefined;
      let output: unknown[] = arr;
      for (let i = 0; i < arr.length; i++) {
        const entry =
          i < headEnd
            ? prefix[i]
            : i >= tailStart
              ? suffix[i - tailStart]
              : rest;
        const r = callMatcher(entry, arr[i], flags);
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
        return { ok: true, value: output };
      }
    }));
  }

  concat(
    type: ArrayType | TupleType | VariadicTupleType,
  ): ArrayType | TupleType | VariadicTupleType {
    if (this.restType) {
      if (type.restType) {
        throw new TypeError("can not concatenate two variadic types");
      }
      return new ArrayOrTupleType(this.prefix, this.restType, [
        ...this.suffix,
        ...type.prefix,
        ...type.suffix,
      ]) as VariadicTupleType;
    } else if (type.restType) {
      return new ArrayOrTupleType(
        [...this.prefix, ...this.suffix, ...type.prefix],
        type.restType,
        type.suffix,
      ) as VariadicTupleType;
    } else {
      return new ArrayOrTupleType(
        [...this.prefix, ...this.suffix, ...type.prefix, ...type.suffix],
        type.restType,
        type.suffix,
      ) as TupleType;
    }
  }
}

/**
 * A validator for arbitrary-length array types like `T[]`.
 */
interface ArrayType<Element extends Type = Type> extends Type<
  Array<Infer<Element>>
> {
  readonly name: "array";

  readonly prefix: [];
  readonly restType: Element;
  readonly suffix: [];

  concat<Suffix extends Type[]>(
    type: TupleType<Suffix>,
  ): VariadicTupleType<[], Element, Suffix>;
}

/**
 * A validator for a fixed-length tuple type like `[]`, `[T1, T2]`
 * or `[T1, T2, ..., Tn]`.
 */
interface TupleType<Elements extends Type[] = Type[]> extends Type<
  TupleOutput<Elements>
> {
  readonly name: "array";

  readonly prefix: Elements;
  readonly restType: undefined;
  readonly suffix: [];

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
  readonly restType: Rest;
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
  return [...new Set(arr)];
}

type InputValidator =
  | UnknownType
  | NeverType
  | StringType
  | NumberType
  | BigIntType
  | BooleanType
  | NullType
  | UndefinedType
  | LiteralType
  | ObjectType
  | ArrayType
  | TupleType
  | VariadicTupleType
  | Optional;

function forEachInputValidator(
  t: Parser,
  func: (input: InputValidator) => void,
  seen = new Set<Parser>(),
) {
  if (seen.has(t)) {
    return;
  }
  seen.add(t);

  if (t.is("lazy") || t.is("transform")) {
    forEachInputValidator(t.inner, func, seen);
  } else if (t.is("optional")) {
    func(t);
    func(undefined_());
    forEachInputValidator(t.inner, func, seen);
  } else if (t.is("union")) {
    for (const option of t.options) {
      forEachInputValidator(option, func, seen);
    }
  } else {
    func(t as InputValidator);
  }
}

function groupInputValidators(
  inputs: Array<{ root: Parser; input: InputValidator }>,
): {
  types: Map<InputType, Parser[]>;
  literals: Map<unknown, Parser[]>;
  unknowns: Parser[];
  optionals: Parser[];
  expectedTypes: InputType[];
} {
  const order = new Map<Parser, number>();
  const literals = new Map<unknown, Parser[]>();
  const types = new Map<InputType, Parser[]>();
  const unknowns = [] as Parser[];
  const optionals = [] as Parser[];
  const expectedTypes = [] as InputType[];
  for (const { root, input } of inputs) {
    order.set(root, order.get(root) ?? order.size);

    if (input.name === "never") {
      // skip
    } else if (input.name === "optional") {
      optionals.push(root);
    } else if (input.name === "unknown") {
      unknowns.push(root);
    } else if (input.name === "literal") {
      const roots = literals.get(input.value) ?? [];
      roots.push(root);
      literals.set(input.value, roots);
      expectedTypes.push(toInputType(input.value));
    } else {
      const roots = types.get(input.name) ?? [];
      roots.push(root);
      types.set(input.name, roots);
      expectedTypes.push(input.name);
    }
  }

  const byOrder = (a: Parser, b: Parser): number => {
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  };

  for (const [value, roots] of literals) {
    const options = types.get(toInputType(value));
    if (options) {
      options.push(...roots);
      literals.delete(value);
    } else {
      literals.set(value, dedup(roots.concat(unknowns)).sort(byOrder));
    }
  }

  for (const [type, roots] of types) {
    types.set(type, dedup(roots.concat(unknowns)).sort(byOrder));
  }

  return {
    types,
    literals,
    unknowns: dedup(unknowns).sort(byOrder),
    optionals: dedup(optionals).sort(byOrder),
    expectedTypes: dedup(expectedTypes),
  };
}

function createObjectKeyMatcher(
  objects: Array<{ root: Parser; input: ObjectType }>,
  key: string,
): Matcher<Record<string, unknown>> | undefined {
  const list: Array<{ root: Parser; input: InputValidator }> = [];
  for (const { root, input } of objects) {
    forEachInputValidator(input.shape[key], (t) => {
      list.push({ root, input: t });
    });
  }

  const { types, literals, optionals, unknowns, expectedTypes } =
    groupInputValidators(list);
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

  const missingValue = prependPath(key, ISSUE_MISSING_VALUE);
  const issue = prependPath(
    key,
    types.size === 0
      ? expectedLiteral([...literals.keys()] as Literal[])
      : expectedType(expectedTypes),
  );

  const byLiteral =
    literals.size > 0 ? new Map<unknown, TaggedMatcher>() : undefined;
  if (byLiteral) {
    for (const [literal, options] of literals) {
      byLiteral.set(literal, options[0][MATCHER_SYMBOL]);
    }
  }

  const byType =
    types.size > 0 ? ({} as Record<string, TaggedMatcher>) : undefined;
  if (byType) {
    for (const [type, options] of types) {
      byType[type] = options[0][MATCHER_SYMBOL];
    }
  }

  const optional = optionals[0]?.[MATCHER_SYMBOL] as TaggedMatcher | undefined;
  return (obj, flags) => {
    const value = obj[key];
    if (value === undefined && !(key in obj)) {
      return optional === undefined
        ? missingValue
        : callMatcher(optional, obj, flags);
    }
    const option = byType?.[toInputType(value)] ?? byLiteral?.get(value);
    return option ? callMatcher(option, obj, flags) : issue;
  };
}

function createUnionObjectMatcher(
  inputs: Array<{ root: Parser; input: InputValidator }>,
): Matcher<Record<string, unknown>> | undefined {
  const objects: Array<{ root: Parser; input: ObjectType }> = [];
  const keyCounts = new Map<string, number>();

  for (const { root, input } of inputs) {
    if (input.name === "unknown") {
      return undefined;
    }

    if (input.name === "object") {
      for (const key in input.shape) {
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      }
      objects.push({ root, input });
    }
  }

  if (objects.length < 2) {
    return undefined;
  }

  for (const [key, count] of keyCounts) {
    if (count === objects.length) {
      const matcher = createObjectKeyMatcher(objects, key);
      if (matcher) {
        return matcher;
      }
    }
  }
  return undefined;
}

function createUnionBaseMatcher(
  inputs: Array<{ root: Parser; input: InputValidator }>,
): Matcher {
  const { expectedTypes, literals, types, unknowns, optionals } =
    groupInputValidators(inputs);

  const issue: IssueLeaf =
    types.size === 0 && unknowns.length === 0
      ? expectedLiteral([...literals.keys()] as Literal[])
      : expectedType(expectedTypes);

  const byLiteral =
    literals.size > 0 ? new Map<unknown, TaggedMatcher[]>() : undefined;
  if (byLiteral) {
    for (const [literal, options] of literals) {
      byLiteral.set(
        literal,
        options.map((t) => t[MATCHER_SYMBOL]),
      );
    }
  }

  const byType =
    types.size > 0 ? ({} as Record<string, TaggedMatcher[]>) : undefined;
  if (byType) {
    for (const [type, options] of types) {
      byType[type] = options.map((t) => t[MATCHER_SYMBOL]);
    }
  }

  const optionalMatchers = optionals.map((t) => t[MATCHER_SYMBOL]);
  const unknownMatchers = unknowns.map((t) => t[MATCHER_SYMBOL]);
  return (value: unknown, flags: number) => {
    const options =
      flags & FLAG_MISSING_VALUE
        ? optionalMatchers
        : (byType?.[toInputType(value)] ??
          byLiteral?.get(value) ??
          unknownMatchers);

    let count = 0;
    let issueTree: IssueTree = issue;
    for (let i = 0; i < options.length; i++) {
      const r = callMatcher(options[i], value, flags);
      if (r === undefined || r.ok) {
        return r;
      }
      issueTree = count > 0 ? joinIssues(issueTree, r) : r;
      count++;
    }
    if (count > 1) {
      return invalidUnion(issueTree);
    }
    return issueTree;
  };
}

interface UnionType<Options extends Type[] = Type[]> extends Type<
  Infer<Options[number]>
> {
  readonly name: "union";
  readonly options: Readonly<Options>;
}

class UnionTypeImpl<Options extends Type[]>
  extends TypeImpl<Infer<Options[number]>>
  implements Type<Infer<Options[number]>>
{
  readonly name = "union";
  readonly options: Readonly<Options>;
  #matcher: TaggedMatcher | undefined;

  constructor(options: Readonly<Options>) {
    super();
    this.options = options;
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    if (this.#matcher !== undefined) {
      return this.#matcher;
    }

    const flattened: Array<{ root: Parser; input: InputValidator }> = [];
    for (const option of this.options) {
      forEachInputValidator(option, (input) => {
        flattened.push({ root: option, input });
      });
    }
    const base = createUnionBaseMatcher(flattened);
    const object = createUnionObjectMatcher(flattened);
    return (this.#matcher = taggedMatcher(TAG_UNION, (v, f) =>
      object !== undefined && isObject(v) ? object(v, f) : base(v, f),
    ));
  }
}

type TransformFunc = (value: unknown, flags: number) => MatcherResult;

const STRICT = Object.freeze({ mode: "strict" }) as ParseOptions;
const STRIP = Object.freeze({ mode: "strip" }) as ParseOptions;
const PASSTHROUGH = Object.freeze({ mode: "passthrough" }) as ParseOptions;

function flagsToOptions(flags: number): ParseOptions {
  return flags & FLAG_FORBID_EXTRA_KEYS
    ? STRICT
    : flags & FLAG_STRIP_EXTRA_KEYS
      ? STRIP
      : PASSTHROUGH;
}

interface TransformType<
  Output = unknown,
  Inner extends Parser = Parser,
> extends Type<Output> {
  readonly name: "transform";
  readonly inner: Inner;
}

class TransformTypeImpl<Output = unknown, Inner extends Parser = Parser>
  extends TypeImpl<Output>
  implements TransformType<Output, Inner>
{
  readonly name = "transform";
  readonly inner: Inner;

  readonly #transform: TransformFunc;
  #matcher: TaggedMatcher | undefined;

  constructor(inner: Inner, transform: TransformFunc) {
    super();
    this.inner = inner;
    this.#transform = transform;
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    if (this.#matcher !== undefined) {
      return this.#matcher;
    }

    const chain: TransformFunc[] = [];

    let next = this as Parser;
    while (next instanceof TransformTypeImpl) {
      chain.push(next.#transform);
      next = next.inner as Parser;
    }
    chain.reverse();

    const matcher = next[MATCHER_SYMBOL];
    const undef = ok(undefined);

    return (this.#matcher = taggedMatcher(TAG_TRANSFORM, (v, flags) => {
      let result = callMatcher(matcher, v, flags);
      if (result !== undefined && !result.ok) {
        return result;
      }

      let current: unknown;
      if (result !== undefined) {
        current = result.value;
      } else if (flags & FLAG_MISSING_VALUE) {
        current = undefined;
        result = undef;
      } else {
        current = v;
      }

      for (let i = 0; i < chain.length; i++) {
        const r = chain[i](current, flags);
        if (r !== undefined) {
          if (!r.ok) {
            return r;
          }
          current = r.value;
          result = r;
        }
      }
      return result;
    }));
  }
}

interface LazyType<Output = unknown> extends Type<Output> {
  readonly name: "lazy";
  readonly inner: Type<Output>;
}

class LazyTypeImpl<Output> extends TypeImpl<Output> {
  readonly name = "lazy";

  readonly initialize: () => Type<Output>;
  #initializing = false;
  #inner: Type<Output> | undefined;
  #matcher: TaggedMatcher | undefined;

  constructor(initialize: () => Type<Output>) {
    super();
    this.initialize = initialize;
  }

  get inner(): Type<Output> {
    if (this.#initializing) {
      throw new TypeError("cannot access .inner while it's being initialized");
    }

    this.#initializing = true;
    try {
      return (this.#inner ??= this.initialize());
    } finally {
      this.#initializing = false;
    }
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    if (this.#matcher !== undefined) {
      return this.#matcher;
    }

    const matcher = taggedMatcher(TAG_OTHER, (value, flags) => {
      const typeMatcher = this.inner[MATCHER_SYMBOL];
      matcher.tag = typeMatcher.tag;
      matcher.match = typeMatcher.match;
      this.#matcher = typeMatcher;
      return callMatcher(typeMatcher, value, flags);
    });
    return (this.#matcher = matcher);
  }
}

function singleton<T extends Type>(
  name: T["name"],
  tag: number,
  match: (value: unknown, flags: number) => MatcherResult,
): () => T {
  const matcher = taggedMatcher(tag, match);

  class SimpleType extends TypeImpl<Infer<T>> {
    readonly name: T["name"];

    constructor() {
      super();
      this.name = name;
    }

    get [MATCHER_SYMBOL](): TaggedMatcher {
      return matcher;
    }
  }

  const instance = new SimpleType();
  return /*#__NO_SIDE_EFFECTS__*/ () => instance as unknown as T;
}

interface UnknownType extends Type {
  readonly name: "unknown";
}

/**
 * Create a validator that matches any value,
 * analogous to the TypeScript type `unknown`.
 */
export const unknown: () => UnknownType = /*#__PURE__*/ singleton<UnknownType>(
  "unknown",
  TAG_UNKNOWN,
  () => undefined,
);

interface NeverType extends Type<never> {
  readonly name: "never";
}

/**
 * Create a validator that never matches any value,
 * analogous to the TypeScript type `never`.
 */
export const never: () => NeverType = /*#__PURE__*/ singleton<NeverType>(
  "never",
  TAG_NEVER,
  () => ISSUE_EXPECTED_NOTHING,
);

interface StringType extends Type<string> {
  readonly name: "string";
}

/**
 * Create a validator that matches any string value.
 */
export const string: () => StringType = /*#__PURE__*/ singleton<StringType>(
  "string",
  TAG_STRING,
  (v) => (typeof v === "string" ? undefined : ISSUE_EXPECTED_STRING),
);

interface NumberType extends Type<number> {
  readonly name: "number";
}

/**
 * Create a validator that matches any number value.
 */
export const number: () => NumberType = /*#__PURE__*/ singleton<NumberType>(
  "number",
  TAG_NUMBER,
  (v) => (typeof v === "number" ? undefined : ISSUE_EXPECTED_NUMBER),
);

interface BigIntType extends Type<bigint> {
  readonly name: "bigint";
}

/**
 * Create a validator that matches any bigint value.
 */
export const bigint: () => BigIntType = /*#__PURE__*/ singleton<BigIntType>(
  "bigint",
  TAG_BIGINT,
  (v) => (typeof v === "bigint" ? undefined : ISSUE_EXPECTED_BIGINT),
);

interface BooleanType extends Type<boolean> {
  readonly name: "boolean";
}

/**
 * Create a validator that matches any boolean value.
 */
export const boolean: () => BooleanType = /*#__PURE__*/ singleton<BooleanType>(
  "boolean",
  TAG_BOOLEAN,
  (v) => (typeof v === "boolean" ? undefined : ISSUE_EXPECTED_BOOLEAN),
);

interface NullType extends Type<null> {
  readonly name: "null";
}

/**
 * Create a validator that matches `null`.
 */
const null_: () => NullType = /*#__PURE__*/ singleton<NullType>(
  "null",
  TAG_NULL,
  (v) => (v === null ? undefined : ISSUE_EXPECTED_NULL),
);
export { null_ as null };

interface UndefinedType extends Type<undefined> {
  readonly name: "undefined";
}

/**
 * Create a validator that matches `undefined`.
 */
const undefined_: () => UndefinedType = /*#__PURE__*/ singleton<UndefinedType>(
  "undefined",
  TAG_UNDEFINED,
  (v) => (v === undefined ? undefined : ISSUE_EXPECTED_UNDEFINED),
);
export { undefined_ as undefined };

interface LiteralType<L extends Literal = Literal> extends Type<L> {
  readonly name: "literal";
  readonly value: L;
}

class LiteralTypeImpl<L extends Literal> extends TypeImpl<L> {
  readonly name = "literal";
  readonly value: L;
  #matcher: TaggedMatcher | undefined;

  constructor(value: L) {
    super();
    this.value = value;
  }

  get [MATCHER_SYMBOL](): TaggedMatcher {
    if (this.#matcher !== undefined) {
      return this.#matcher;
    }
    const value = this.value;
    const issue = expectedLiteral([value]);
    return (this.#matcher ??= taggedMatcher(TAG_LITERAL, (v) =>
      v === value ? undefined : issue,
    ));
  }
}

/**
 * Create a validator for a specific string, number, bigint or boolean value.
 */
export const literal = <T extends Literal>(value: T): LiteralType<T> => {
  return /*#__PURE__*/ new LiteralTypeImpl(value);
};

/**
 * Create a validator for an object type.
 */
export const object = <T extends Record<string, Parser>>(
  obj: T,
): ObjectType<T, undefined> => {
  return /*#__PURE__*/ new ObjectTypeImpl(obj, undefined);
};

/**
 * Create a validator for a record type `Record<string, T>`,
 * where `T` is the output type of the given subvalidator.
 */
export const record = <T extends Type>(
  valueType?: T,
): Type<Record<string, Infer<T>>> => {
  return /*#__PURE__*/ new ObjectTypeImpl({}, valueType ?? unknown());
};

/**
 * Create a validator for an array type `T[]`,
 * where `T` is the output type of the given subvalidator.
 */
export const array = <T extends Type>(item?: T): ArrayType<T> => {
  return /*#__PURE__*/ new ArrayOrTupleType(
    [],
    item ?? unknown(),
    [],
  ) as unknown as ArrayType<T>;
};

/**
 * Create a validator for an array type `[T1, T2, ..., Tn]`,
 * where `T1`, `T2`, ..., `Tn` are the output types of the given subvalidators.
 */
export const tuple = <T extends [] | [Type, ...Type[]]>(
  items: T,
): TupleType<T> => {
  return /*#__PURE__*/ new ArrayOrTupleType<T, undefined, []>(
    items,
    undefined,
    [],
  ) as unknown as TupleType<T>;
};

/**
 * Create a validator that matches any type `T1 | T2 | ... | Tn`,
 * where `T1`, `T2`, ..., `Tn` are the output types of the given subvalidators.
 *
 * This is analogous to how TypeScript's union types are constructed.
 */
export const union = <T extends Type[]>(...options: T): UnionType<T> => {
  return /*#__PURE__*/ new UnionTypeImpl<T>(options);
};

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
export const lazy = <T>(initialize: () => Type<T>): LazyType<T> => {
  return /*#__PURE__*/ new LazyTypeImpl(initialize);
};

export type { Type, Optional };
export type {
  UnknownType,
  NeverType,
  StringType,
  NumberType,
  BigIntType,
  BooleanType,
  NullType,
  UndefinedType,
  LiteralType,
  ObjectType,
  ArrayType,
  TupleType,
  VariadicTupleType,
  UnionType,
  TransformType,
  LazyType,
};
