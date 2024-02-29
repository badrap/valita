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
  | { ok: false; code: "invalid_length"; minLength: number; maxLength: number }
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
      maxLength: number;
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
    default:
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
      path += "." + tree.key;
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
      } else if (max < Infinity) {
        message += `between ${min} and ${max}`;
      } else {
        message += `at least ${min}`;
      }
    } else {
      message += `at most ${max}`;
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
  readonly issues: readonly Issue[];
  readonly message: string;
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

const Nothing = Symbol.for("valita.Nothing");

const enum FuncMode {
  PASS = 0,
  STRICT = 1,
  STRIP = 2,
}
type Func<T> = (v: unknown, mode: FuncMode) => RawResult<T>;

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

abstract class AbstractType<Output = unknown> {
  abstract readonly name: string;
  abstract toTerminals(func: (t: TerminalType) => void): void;
  abstract func(v: unknown, mode: FuncMode): RawResult<Output>;

  optional(): Optional<Output> {
    return new Optional(this);
  }

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
    func: ((v: Output) => v is T) | ((v: Output) => boolean),
    error?: CustomError,
  ): Type<T> {
    const err: IssueLeaf = { ok: false, code: "custom_error", error };
    return new TransformType(this, (v) =>
      func(v as Output) ? undefined : err,
    );
  }

  map<T extends Literal>(func: (v: Output) => T): Type<T>;
  map<T>(func: (v: Output) => T): Type<T>;
  map<T>(func: (v: Output) => T): Type<T> {
    return new TransformType(this, (v) => ({
      ok: true,
      value: func(v as Output),
    }));
  }

  chain<T extends Literal>(func: (v: Output) => ValitaResult<T>): Type<T>;
  chain<T>(func: (v: Output) => ValitaResult<T>): Type<T>;
  chain<T>(func: (v: Output) => ValitaResult<T>): Type<T> {
    return new TransformType(this, (v) => {
      const r = func(v as Output);
      return r.ok ? r : (r as unknown as { issueTree: IssueTree }).issueTree;
    });
  }
}

type ParseOptions = {
  mode: "passthrough" | "strict" | "strip";
};

/**
 * A base class for all concreate validators/parsers.
 */
abstract class Type<Output = unknown> extends AbstractType<Output> {
  nullable(): Type<null | Output> {
    return union(nullSingleton, this);
  }

  toTerminals(func: (t: TerminalType) => void): void {
    func(this as TerminalType);
  }

  try(v: unknown, options?: Partial<ParseOptions>): ValitaResult<Infer<this>> {
    let mode: FuncMode = FuncMode.STRICT;
    if (options !== undefined) {
      if (options.mode === "passthrough") {
        mode = FuncMode.PASS;
      } else if (options.mode === "strip") {
        mode = FuncMode.STRIP;
      }
    }

    const r = this.func(v, mode);
    if (r === undefined) {
      return { ok: true, value: v as Infer<this> };
    } else if (r.ok) {
      return { ok: true, value: r.value as Infer<this> };
    } else {
      return new ErrImpl(r);
    }
  }

  parse(v: unknown, options?: Partial<ParseOptions>): Infer<this> {
    let mode: FuncMode = FuncMode.STRICT;
    if (options !== undefined) {
      if (options.mode === "passthrough") {
        mode = FuncMode.PASS;
      } else if (options.mode === "strip") {
        mode = FuncMode.STRIP;
      }
    }

    const r = this.func(v, mode);
    if (r === undefined) {
      return v as Infer<this>;
    } else if (r.ok) {
      return r.value as Infer<this>;
    } else {
      throw new ValitaError(r);
    }
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

  func(v: unknown, mode: FuncMode): RawResult<Output | undefined> {
    return v === undefined || v === Nothing
      ? undefined
      : this.type.func(v, mode);
  }

  toTerminals(func: (t: TerminalType) => void): void {
    func(this);
    func(undefinedSingleton);
    this.type.toTerminals(func);
  }

  optional(): Optional<Output> {
    return this;
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
      ? { [K: string]: I }
      : R extends Optional<infer J>
        ? Partial<{ [K: string]: J }>
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

  private _func?: Func<unknown>;

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

  func(v: unknown, mode: FuncMode): RawResult<ObjectOutput<Shape, Rest>> {
    let func = this._func;
    if (func === undefined) {
      func = createObjectMatcher(this.shape, this.restType, this.checks);
      this._func = func;
    }
    return func(v, mode) as RawResult<ObjectOutput<Shape, Rest>>;
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

function createObjectMatcher(
  shape: ObjectShape,
  rest?: AbstractType,
  checks?: {
    func: (v: unknown) => boolean;
    issue: IssueLeaf;
  }[],
): Func<unknown> {
  const requiredKeys: string[] = [];
  const optionalKeys: string[] = [];
  for (const key in shape) {
    let hasOptional = false;
    shape[key].toTerminals((t) => {
      hasOptional ||= t.name === "optional";
    });
    if (hasOptional) {
      optionalKeys.push(key);
    } else {
      requiredKeys.push(key);
    }
  }
  const keys = [...requiredKeys, ...optionalKeys];
  const totalCount = keys.length;
  const invalidType: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: ["object"],
  };

  if (totalCount === 0 && rest?.name === "unknown") {
    // A fast path for record(unknown())
    return function (obj, _) {
      if (!isObject(obj)) {
        return invalidType;
      }

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

  const types = keys.map((key) => shape[key]);
  const requiredCount = requiredKeys.length;
  const invertedIndexes = Object.create(null);
  keys.forEach((key, index) => {
    invertedIndexes[key] = ~index;
  });
  const missingValues = requiredKeys.map((key) =>
    prependPath(key, {
      ok: false,
      code: "missing_value",
    }),
  );

  function set(
    obj: Record<string, unknown>,
    key: string,
    value: unknown,
  ): void {
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

  return function (obj, mode) {
    if (!isObject(obj)) {
      return invalidType;
    }

    let copied = false;
    let output = obj;
    let issues: IssueTree | undefined;
    let unrecognized: Key[] | undefined = undefined;
    let seenBits: BitSet = 0;
    let seenCount = 0;

    if (mode !== FuncMode.PASS || rest !== undefined) {
      for (const key in obj) {
        const value = obj[key];
        const index = ~invertedIndexes[key];

        let r: RawResult<unknown>;
        if (index >= 0) {
          seenCount++;
          seenBits = setBit(seenBits, index);
          r = types[index].func(value, mode);
        } else if (rest !== undefined) {
          r = rest.func(value, mode);
        } else {
          if (mode === FuncMode.STRICT) {
            if (unrecognized === undefined) {
              unrecognized = [key];
            } else {
              unrecognized.push(key);
            }
          } else if (
            mode === FuncMode.STRIP &&
            issues === undefined &&
            !copied
          ) {
            output = {};
            copied = true;
            for (let m = 0; m < totalCount; m++) {
              if (getBit(seenBits, m)) {
                const k = keys[m];
                set(output, k, obj[k]);
              }
            }
          }
          continue;
        }

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
            if (rest === undefined) {
              for (let m = 0; m < totalCount; m++) {
                if (m !== index && getBit(seenBits, m)) {
                  const k = keys[m];
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
      }
    }

    if (seenCount < totalCount) {
      for (let i = 0; i < totalCount; i++) {
        if (getBit(seenBits, i)) {
          continue;
        }
        const key = keys[i];
        let value = obj[key];
        if (value === undefined && !(key in obj)) {
          if (i < requiredCount) {
            issues = joinIssues(issues, missingValues[i]);
            continue;
          }
          value = Nothing;
        }
        const r = types[i].func(value, mode);
        if (r === undefined) {
          if (copied && issues === undefined && value !== Nothing) {
            set(output, key, value);
          }
        } else if (!r.ok) {
          issues = joinIssues(issues, prependPath(key, r));
        } else if (issues === undefined) {
          if (!copied) {
            output = {};
            copied = true;
            if (rest === undefined) {
              for (let m = 0; m < totalCount; m++) {
                if (m < i || getBit(seenBits, m)) {
                  const k = keys[m];
                  set(output, k, obj[k]);
                }
              }
            } else {
              for (const k in obj) {
                set(output, k, obj[k]);
              }
              for (let m = 0; m < i; m++) {
                if (!getBit(seenBits, m)) {
                  const k = keys[m];
                  set(output, k, obj[k]);
                }
              }
            }
          }
          set(output, key, r.value);
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

type ArrayOutput<Head extends Type[], Rest extends Type | undefined> = [
  ...TupleOutput<Head>,
  ...(Rest extends Type ? Infer<Rest>[] : []),
];

class ArrayType<
  Head extends Type[] = Type[],
  Rest extends Type | undefined = Type | undefined,
> extends Type<ArrayOutput<Head, Rest>> {
  readonly name = "array";

  private readonly rest: Type;
  private readonly invalidType: IssueLeaf;
  private readonly invalidLength: IssueLeaf;
  private readonly minLength: number;
  private readonly maxLength: number;

  constructor(
    readonly head: Head,
    rest?: Rest,
  ) {
    super();

    this.rest = rest ?? never();
    this.minLength = this.head.length;
    this.maxLength = rest ? Infinity : this.minLength;
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

  func(arr: unknown, mode: FuncMode): RawResult<ArrayOutput<Head, Rest>> {
    if (!Array.isArray(arr)) {
      return this.invalidType;
    }

    const length = arr.length;
    const minLength = this.minLength;
    const maxLength = this.maxLength;
    if (length < minLength || length > maxLength) {
      return this.invalidLength;
    }

    let issueTree: IssueTree | undefined = undefined;
    let output: unknown[] = arr;
    for (let i = 0; i < arr.length; i++) {
      const type = i < minLength ? this.head[i] : this.rest;
      const r = type.func(arr[i], mode);
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
      return { ok: true, value: output as ArrayOutput<Head, Rest> };
    }
  }
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
      map.set(key, (map.get(key) || 0) + 1);
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
      const roots = literals.get(terminal.value) || [];
      roots.push(root);
      literals.set(terminal.value, roots);
      expectedTypes.push(toInputType(terminal.value));
    } else {
      const roots = types.get(terminal.name) || [];
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

  return function (_obj: unknown, mode: FuncMode) {
    const obj = _obj as Record<string, unknown>;
    const value = obj[key];
    if (value === undefined && !(key in obj)) {
      return optionals.length > 0 ? optionals[0].func(obj, mode) : missingValue;
    }
    const option = byType?.[toInputType(value)] ?? litMap?.get(value);
    return option ? option.func(obj, mode) : issue;
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

  return function (value: unknown, mode: FuncMode) {
    let options: undefined | AbstractType[];
    if (value === Nothing) {
      options = optionals;
    } else {
      options = byType?.[toInputType(value)] ?? litMap?.get(value) ?? unknowns;
    }
    if (!options) {
      return issue;
    }

    let count = 0;
    let issueTree: IssueTree = issue;
    for (let i = 0; i < options.length; i++) {
      const r = options[i].func(value, mode);
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
    this.options.forEach((o) => o.toTerminals(func));
  }

  func(v: unknown, mode: FuncMode): RawResult<Infer<T[number]>> {
    let func = this._func;
    if (func === undefined) {
      const flattened: { root: AbstractType; terminal: TerminalType }[] = [];
      this.options.forEach((option) =>
        option.toTerminals((terminal) => {
          flattened.push({ root: option, terminal });
        }),
      );
      const base = createUnionBaseMatcher(flattened);
      const object = createUnionObjectMatcher(flattened);
      if (!object) {
        func = base as Func<Infer<T[number]>>;
      } else {
        func = function (v, mode) {
          if (isObject(v)) {
            return object(v, mode) as RawResult<Infer<T[number]>>;
          }
          return base(v, mode) as RawResult<Infer<T[number]>>;
        };
      }
      this._func = func;
    }
    return func(v, mode);
  }
}

class TransformType<Output> extends Type<Output> {
  readonly name = "transform";

  private transformChain?: Func<unknown>[];
  private transformRoot?: AbstractType;
  private readonly undef = ok(undefined);

  constructor(
    protected readonly transformed: AbstractType,
    protected readonly transform: Func<unknown>,
  ) {
    super();
    this.transformChain = undefined;
    this.transformRoot = undefined;
  }

  func(v: unknown, mode: FuncMode): RawResult<Output> {
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

    // eslint-disable-next-line
    let result = this.transformRoot!.func(v, mode);
    if (result !== undefined && !result.ok) {
      return result;
    }

    let current: unknown;
    if (result !== undefined) {
      current = result.value;
    } else if (v === Nothing) {
      current = undefined;
      result = this.undef;
    } else {
      current = v;
    }

    for (let i = 0; i < chain.length; i++) {
      const r = chain[i](current, mode);
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

  func(v: unknown, mode: FuncMode): RawResult<T> {
    if (!this.type) {
      this.type = this.definer();
    }
    return this.type.func(v, mode);
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
  func(_: unknown, __: FuncMode): RawResult<never> {
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

class UnknownType extends Type<unknown> {
  readonly name = "unknown";
  func(_: unknown, __: FuncMode): RawResult<unknown> {
    return undefined;
  }
}
const unknownSingleton = new UnknownType();

/**
 * Create a validator that matches any value,
 * analogous to the TypeScript type `unknown`.
 */
function unknown(): Type<unknown> {
  return unknownSingleton;
}

class UndefinedType extends Type<undefined> {
  readonly name = "undefined";
  private readonly issue: IssueLeaf = {
    ok: false,
    code: "invalid_type",
    expected: ["undefined"],
  };
  func(v: unknown, _: FuncMode): RawResult<undefined> {
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
  func(v: unknown, _: FuncMode): RawResult<null> {
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
  func(v: unknown, _: FuncMode): RawResult<number> {
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
  func(v: unknown, _: FuncMode): RawResult<bigint> {
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
  func(v: unknown, _: FuncMode): RawResult<string> {
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
  func(v: unknown, _: FuncMode): RawResult<boolean> {
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
  func(v: unknown, _: FuncMode): RawResult<Out> {
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
function object<T extends Record<string, Type | Optional>>(
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
function array<T extends Type>(item: T): ArrayType<[], T> {
  return new ArrayType([], item);
}

/**
 * Create a validator for an array type `[T1, T2, ..., Tn]`,
 * where `T1`, `T2`, ..., `Tn` are the output types of the given subvalidators.
 */
function tuple<T extends [] | [Type, ...Type[]]>(
  items: T,
): ArrayType<T, undefined> {
  return new ArrayType(items);
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
  | ArrayType
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
export type { ObjectType, ArrayType, UnionType };
