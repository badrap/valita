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

type IssueNode<PathType = Key | undefined> = Readonly<
  | { code: "invalid_type"; path: PathType; expected: InputType[] }
  | { code: "missing_value"; path: PathType }
  | { code: "invalid_literal"; path: PathType; expected: Literal[] }
  | {
      code: "invalid_length";
      path: PathType;
      minLength: number;
      maxLength: number;
    }
  | { code: "unrecognized_keys"; path: PathType; keys: Key[] }
  | { code: "invalid_union"; path: PathType; tree: IssueTree }
  | { code: "custom_error"; path: PathType; error: CustomError }
>;

type IssueTree =
  | Readonly<{ code: "prepend"; key: Key; tree: IssueTree }>
  | Readonly<{ code: "join"; left: IssueTree; right: IssueTree }>
  | IssueNode;

type Issue = IssueNode<Key[]>;

function joinIssues(left: IssueTree | undefined, right: IssueTree): IssueTree {
  return left ? { code: "join", left, right } : right;
}

function prependPath(key: Key, tree: IssueTree): IssueTree {
  return { code: "prepend", key, tree };
}

function cloneIssueWithPath(tree: IssueNode, path: Key[]): Issue {
  switch (tree.code) {
    case "invalid_type":
      return { code: "invalid_type", path, expected: tree.expected };
    case "invalid_literal":
      return { code: "invalid_literal", path, expected: tree.expected };
    case "missing_value":
      return { code: "missing_value", path };
    case "invalid_length":
      return {
        code: "invalid_length",
        path,
        minLength: tree.minLength,
        maxLength: tree.maxLength,
      };
    case "unrecognized_keys":
      return { code: "unrecognized_keys", path, keys: tree.keys };
    case "invalid_union":
      return { code: "invalid_union", path, tree: tree.tree };
    default:
      return { code: "custom_error", path, error: tree.error };
  }
}

function collectIssues(
  tree: IssueTree,
  path: Key[] = [],
  issues: Issue[] = [],
): Issue[] {
  if (tree.code === "join") {
    collectIssues(tree.left, path.slice(), issues);
    collectIssues(tree.right, path, issues);
  } else if (tree.code === "prepend") {
    path.push(tree.key);
    collectIssues(tree.tree, path, issues);
  } else {
    if (tree.path !== undefined) {
      path.push(tree.path);
    }
    if (
      tree.code === "custom_error" &&
      typeof tree.error === "object" &&
      tree.error.path !== undefined
    ) {
      path.push(...tree.error.path);
    }
    issues.push(cloneIssueWithPath(tree, path));
  }
  return issues;
}

function separatedList(list: string[], separator: "or" | "and"): string {
  if (list.length === 0) {
    return "nothing";
  }
  const last = list[list.length - 1];
  if (list.length < 2) {
    return last;
  }
  return `${list.slice(0, -1).join(", ")} ${separator} ${last}`;
}

function formatLiteral(value: Literal): string {
  return typeof value === "bigint" ? `${value}n` : JSON.stringify(value);
}

function findOneIssue(tree: IssueTree, path: Key[] = []): Issue {
  if (tree.code === "join") {
    return findOneIssue(tree.left, path);
  } else if (tree.code === "prepend") {
    path.push(tree.key);
    return findOneIssue(tree.tree, path);
  } else {
    if (tree.path !== undefined) {
      path.push(tree.path);
    }
    if (
      tree.code === "custom_error" &&
      typeof tree.error === "object" &&
      tree.error.path !== undefined
    ) {
      path.push(...tree.error.path);
    }
    return cloneIssueWithPath(tree, path);
  }
}

function countIssues(tree: IssueTree): number {
  if (tree.code === "join") {
    return countIssues(tree.left) + countIssues(tree.right);
  } else if (tree.code === "prepend") {
    return countIssues(tree.tree);
  } else {
    return 1;
  }
}

function formatIssueTree(issueTree: IssueTree): string {
  const count = countIssues(issueTree);
  const issue = findOneIssue(issueTree);

  let message = "validation failed";
  if (issue.code === "invalid_type") {
    message = `expected ${separatedList(issue.expected, "or")}`;
  } else if (issue.code === "invalid_literal") {
    message = `expected ${separatedList(
      issue.expected.map(formatLiteral),
      "or",
    )}`;
  } else if (issue.code === "missing_value") {
    message = `missing value`;
  } else if (issue.code === "unrecognized_keys") {
    const keys = issue.keys;
    message = `unrecognized ${
      keys.length === 1 ? "key" : "keys"
    } ${separatedList(keys.map(formatLiteral), "and")}`;
  } else if (issue.code === "invalid_length") {
    const min = issue.minLength;
    const max = issue.maxLength;
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
  } else if (issue.code === "custom_error") {
    const error = issue.error;
    if (typeof error === "string") {
      message = error;
    } else if (error && error.message === "string") {
      message = error.message;
    }
  }

  let msg = `${issue.code} at .${issue.path.join(".")} (${message})`;
  if (count === 2) {
    msg += ` (+ 1 other issue)`;
  } else if (count > 2) {
    msg += ` (+ ${count - 1} other issues)`;
  }
  return msg;
}

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

interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

class Err {
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

function ok<T extends Literal>(value: T): Ok<T>;
function ok<T>(value: T): Ok<T>;
function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

function err(error?: CustomError): Err {
  return new Err({ code: "custom_error", path: undefined, error });
}

export type { Ok, Err };
export type ValitaResult<V> = Ok<V> | Err;

type RawResult<T> = true | Readonly<{ code: "ok"; value: T }> | IssueTree;

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

export type Infer<T extends AbstractType> = T extends AbstractType<infer I>
  ? I
  : never;

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
    const defaultResult = { code: "ok", value: defaultValue } as RawResult<
      Exclude<Output, undefined> | T
    >;
    return new TransformType(this.optional(), (v) => {
      return v === undefined ? defaultResult : true;
    });
  }

  assert<T extends Output>(
    func: ((v: Output) => v is T) | ((v: Output) => boolean),
    error?: CustomError,
  ): Type<T> {
    const err: IssueNode = { code: "custom_error", path: undefined, error };
    return new TransformType(this, (v) => (func(v as Output) ? true : err));
  }

  map<T extends Literal>(func: (v: Output) => T): Type<T>;
  map<T>(func: (v: Output) => T): Type<T>;
  map<T>(func: (v: Output) => T): Type<T> {
    return new TransformType(this, (v) => ({
      code: "ok",
      value: func(v as Output),
    }));
  }

  chain<T extends Literal>(func: (v: Output) => ValitaResult<T>): Type<T>;
  chain<T>(func: (v: Output) => ValitaResult<T>): Type<T>;
  chain<T>(func: (v: Output) => ValitaResult<T>): Type<T> {
    return new TransformType(this, (v) => {
      const r = func(v as Output);
      if (r.ok) {
        return { code: "ok", value: r.value };
      } else {
        return (r as unknown as { issueTree: IssueTree }).issueTree;
      }
    });
  }
}

type ParseOptions = {
  mode: "passthrough" | "strict" | "strip";
};

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
    if (r === true) {
      return { ok: true, value: v as Infer<this> };
    } else if (r.code === "ok") {
      return { ok: true, value: r.value as Infer<this> };
    } else {
      return new Err(r);
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
    if (r === true) {
      return v as Infer<this>;
    } else if (r.code === "ok") {
      return r.value as Infer<this>;
    } else {
      throw new ValitaError(r);
    }
  }
}

class Optional<Output = unknown> extends AbstractType<Output | undefined> {
  readonly name = "optional";

  constructor(private readonly type: AbstractType<Output>) {
    super();
  }

  func(v: unknown, mode: FuncMode): RawResult<Output | undefined> {
    return v === undefined || v === Nothing ? true : this.type.func(v, mode);
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

function prependIssue(issue: IssueTree, result: RawResult<unknown>): IssueTree {
  return result === true || result.code === "ok"
    ? issue
    : joinIssues(issue, result);
}
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
      issue: IssueNode;
    }[],
  ) {
    super();
  }

  check(
    func: (v: ObjectOutput<Shape, Rest>) => boolean,
    error?: CustomError,
  ): ObjectType<Shape, Rest> {
    const issue: IssueNode = { code: "custom_error", path: undefined, error };
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

// When an object matcher needs to create a copied version of the input,
// it initializes the new objects with Object.create(protoless).
//
// Using Object.create(protoless) instead of just {} makes setting
// "__proto__" key safe. Previously we set object properties with a helper
// function that special-cased "__proto__". Now we can just do
// `output[key] = value` directly.
//
// Using Object.create(protoless) instead of Object.create(null) seems to
// be faster on V8 at the time of writing this (2023-08-07).
const protoless = Object.create(null);

function createObjectMatcher(
  shape: ObjectShape,
  rest?: AbstractType,
  checks?: {
    func: (v: unknown) => boolean;
    issue: IssueNode;
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
  const invalidType: IssueNode = {
    code: "invalid_type",
    path: undefined,
    expected: ["object"],
  };

  if (keys.length === 0 && rest === unknownSingleton) {
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
      return true;
    };
  }

  const types = keys.map((key) => shape[key]);
  const requiredCount = requiredKeys.length;
  const invertedIndexes = Object.create(null);
  keys.forEach((key, index) => {
    invertedIndexes[key] = ~index;
  });
  const missingValues: IssueNode[] = requiredKeys.map((key) => ({
    code: "missing_value",
    path: key,
  }));

  return function (obj, mode) {
    if (!isObject(obj)) {
      return invalidType;
    }

    let result: RawResult<Record<string, unknown>> = true;
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
          } else if (mode === FuncMode.STRIP && result === true) {
            result = { code: "ok", value: Object.create(protoless) };
            for (let m = 0; m < keys.length; m++) {
              if (getBit(seenBits, m)) {
                const k = keys[m];
                result.value[k] = obj[k];
              }
            }
          }
          continue;
        }

        if (r === true) {
          if (result !== true && result.code === "ok") {
            result.value[key] = value;
          }
        } else if (r.code !== "ok") {
          result = prependIssue(prependPath(key, r), result);
        } else if (result === true) {
          result = { code: "ok", value: Object.create(protoless) };
          if (rest === undefined) {
            for (let m = 0; m < keys.length; m++) {
              if (m !== index && getBit(seenBits, m)) {
                const k = keys[m];
                result.value[k] = obj[k];
              }
            }
          } else {
            for (const k in obj) {
              result.value[k] = obj[k];
            }
          }
          result.value[key] = r.value;
        } else if (result.code === "ok") {
          result.value[key] = r.value;
        }
      }
    }

    if (seenCount < keys.length) {
      for (let i = 0; i < keys.length; i++) {
        if (getBit(seenBits, i)) {
          continue;
        }
        const key = keys[i];
        let value = obj[key];
        if (value === undefined && !(key in obj)) {
          if (i < requiredCount) {
            result = prependIssue(missingValues[i], result);
            continue;
          }
          value = Nothing;
        }
        const r = types[i].func(value, mode);
        if (r === true) {
          if (result !== true && result.code === "ok" && value !== Nothing) {
            result.value[key] = value;
          }
        } else if (r.code !== "ok") {
          result = prependIssue(prependPath(key, r), result);
        } else if (result === true) {
          result = { code: "ok", value: Object.create(protoless) };
          if (rest === undefined) {
            for (let m = 0; m < keys.length; m++) {
              if (m < i || getBit(seenBits, m)) {
                const k = keys[m];
                result.value[k] = obj[k];
              }
            }
          } else {
            for (const k in obj) {
              result.value[k] = obj[k];
            }
            for (let m = 0; m < i; m++) {
              if (!getBit(seenBits, m)) {
                const k = keys[m];
                result.value[k] = obj[k];
              }
            }
          }
          result.value[key] = r.value;
        } else if (result.code === "ok") {
          result.value[key] = r.value;
        }
      }
    }

    if (unrecognized !== undefined) {
      result = prependIssue(
        {
          code: "unrecognized_keys",
          path: undefined,
          keys: unrecognized,
        },
        result,
      );
    }

    if ((result === true || result.code === "ok") && checks !== undefined) {
      const value = result === true ? obj : result.value;
      for (let i = 0; i < checks.length; i++) {
        if (!checks[i].func(value)) {
          return checks[i].issue;
        }
      }
    }
    return result;
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
  private readonly invalidType: IssueNode;
  private readonly invalidLength: IssueNode;
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
      code: "invalid_type",
      path: undefined,
      expected: ["array"],
    };
    this.invalidLength = {
      code: "invalid_length",
      path: undefined,
      minLength: this.minLength,
      maxLength: this.maxLength,
    };
  }

  toTerminals(func: (t: TerminalType) => void): void {
    func(this);
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
      if (r !== true) {
        if (r.code === "ok") {
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
      return true;
    } else {
      return { code: "ok", value: output as ArrayOutput<Head, Rest> };
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

  const missingValue: IssueNode = { code: "missing_value", path: key };
  const issue: IssueNode =
    types.size === 0
      ? {
          code: "invalid_literal",
          path: key,
          expected: Array.from(literals.keys()) as Literal[],
        }
      : {
          code: "invalid_type",
          path: key,
          expected: expectedTypes,
        };

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

  const issue: IssueNode =
    types.size === 0 && unknowns.length === 0
      ? {
          code: "invalid_literal",
          path: undefined,
          expected: Array.from(literals.keys()) as Literal[],
        }
      : {
          code: "invalid_type",
          path: undefined,
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
      if (r === true || r.code === "ok") {
        return r;
      }
      issueTree = count > 0 ? joinIssues(issueTree, r) : r;
      count++;
    }
    if (count > 1) {
      return { code: "invalid_union", path: undefined, tree: issueTree };
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
  private readonly undef: RawResult<unknown> = { code: "ok", value: undefined };

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
    if (result !== true && result.code !== "ok") {
      return result;
    }

    let current: unknown;
    if (result !== true) {
      current = result.value;
    } else if (v === Nothing) {
      current = undefined;
      result = this.undef;
    } else {
      current = v;
    }

    for (let i = 0; i < chain.length; i++) {
      const r = chain[i](current, mode);
      if (r !== true) {
        if (r.code !== "ok") {
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
  private readonly issue: IssueNode = {
    code: "invalid_type",
    path: undefined,
    expected: [],
  };
  func(_: unknown, __: FuncMode): RawResult<never> {
    return this.issue;
  }
}
const neverSingleton = new NeverType();
function never(): Type<never> {
  return neverSingleton;
}

class UnknownType extends Type<unknown> {
  readonly name = "unknown";
  func(_: unknown, __: FuncMode): RawResult<unknown> {
    return true;
  }
}
const unknownSingleton = new UnknownType();
function unknown(): Type<unknown> {
  return unknownSingleton;
}

class UndefinedType extends Type<undefined> {
  readonly name = "undefined";
  private readonly issue: IssueNode = {
    code: "invalid_type",
    path: undefined,
    expected: ["undefined"],
  };
  func(v: unknown, _: FuncMode): RawResult<undefined> {
    return v === undefined ? true : this.issue;
  }
}
const undefinedSingleton = new UndefinedType();
function undefined_(): Type<undefined> {
  return undefinedSingleton;
}

class NullType extends Type<null> {
  readonly name = "null";
  private readonly issue: IssueNode = {
    code: "invalid_type",
    path: undefined,
    expected: ["null"],
  };
  func(v: unknown, _: FuncMode): RawResult<null> {
    return v === null ? true : this.issue;
  }
}
const nullSingleton = new NullType();
function null_(): Type<null> {
  return nullSingleton;
}

class NumberType extends Type<number> {
  readonly name = "number";
  private readonly issue: IssueNode = {
    code: "invalid_type",
    path: undefined,
    expected: ["number"],
  };
  func(v: unknown, _: FuncMode): RawResult<number> {
    return typeof v === "number" ? true : this.issue;
  }
}
const numberSingleton = new NumberType();
function number(): Type<number> {
  return numberSingleton;
}

class BigIntType extends Type<bigint> {
  readonly name = "bigint";
  private readonly issue: IssueNode = {
    code: "invalid_type",
    path: undefined,
    expected: ["bigint"],
  };
  func(v: unknown, _: FuncMode): RawResult<bigint> {
    return typeof v === "bigint" ? true : this.issue;
  }
}
const bigintSingleton = new BigIntType();
function bigint(): Type<bigint> {
  return bigintSingleton;
}

class StringType extends Type<string> {
  readonly name = "string";
  private readonly issue: IssueNode = {
    code: "invalid_type",
    path: undefined,
    expected: ["string"],
  };
  func(v: unknown, _: FuncMode): RawResult<string> {
    return typeof v === "string" ? true : this.issue;
  }
}
const stringSingleton = new StringType();
function string(): Type<string> {
  return stringSingleton;
}

class BooleanType extends Type<boolean> {
  readonly name = "boolean";
  private readonly issue: IssueNode = {
    code: "invalid_type",
    path: undefined,
    expected: ["boolean"],
  };
  func(v: unknown, _: FuncMode): RawResult<boolean> {
    return typeof v === "boolean" ? true : this.issue;
  }
}
const booleanSingleton = new BooleanType();
function boolean(): Type<boolean> {
  return booleanSingleton;
}

class LiteralType<Out extends Literal = Literal> extends Type<Out> {
  readonly name = "literal";
  private readonly issue: IssueNode;
  constructor(readonly value: Out) {
    super();
    this.issue = {
      code: "invalid_literal",
      path: undefined,
      expected: [value],
    };
  }
  func(v: unknown, _: FuncMode): RawResult<Out> {
    return v === this.value ? true : this.issue;
  }
}
function literal<T extends Literal>(value: T): Type<T> {
  return new LiteralType(value);
}

function object<T extends Record<string, Type | Optional>>(
  obj: T,
): ObjectType<T, undefined> {
  return new ObjectType(obj, undefined);
}

function record<T extends Type>(valueType?: T): Type<Record<string, Infer<T>>> {
  return new ObjectType({}, valueType ?? unknown()) as Type<
    Record<string, Infer<T>>
  >;
}

function array<T extends Type>(item: T): ArrayType<[], T> {
  return new ArrayType([], item);
}

function tuple<T extends [] | [Type, ...Type[]]>(
  items: T,
): ArrayType<T, undefined> {
  return new ArrayType(items);
}

function union<T extends Type[]>(...options: T): UnionType<T> {
  return new UnionType(options);
}

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
