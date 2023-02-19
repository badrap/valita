// This is magic that turns object intersections to nicer-looking types.
type PrettyIntersection<V> = Extract<{ [K in keyof V]: V[K] }, unknown>;

type Literal = string | number | bigint | boolean;
type Key = string | number;
type BaseType =
  | "object"
  | "array"
  | "null"
  | "undefined"
  | "string"
  | "number"
  | "bigint"
  | "boolean";

type I<Code, Extra = unknown> = Readonly<
  PrettyIntersection<
    Extra & {
      code: Code;
      path?: Key[];
    }
  >
>;

type CustomError =
  | undefined
  | string
  | {
      message?: string;
      path?: Key[];
    };

type Issue =
  | I<"invalid_type", { expected: BaseType[] }>
  | I<"missing_value">
  | I<"invalid_literal", { expected: Literal[] }>
  | I<"invalid_length", { minLength: number; maxLength: number }>
  | I<"unrecognized_keys", { keys: Key[] }>
  | I<"invalid_union", { tree: IssueTree }>
  | I<"custom_error", { error: CustomError }>;

type IssueTree =
  | Readonly<{ code: "prepend"; key: Key; tree: IssueTree }>
  | Readonly<{ code: "join"; left: IssueTree; right: IssueTree }>
  | Issue;

function joinIssues(left: IssueTree | undefined, right: IssueTree): IssueTree {
  return left ? { code: "join", left, right } : right;
}

function prependPath(key: Key, tree: IssueTree): IssueTree {
  return { code: "prepend", key, tree };
}

function _collectIssues(tree: IssueTree, path: Key[], issues: Issue[]): void {
  if (tree.code === "join") {
    _collectIssues(tree.left, path, issues);
    _collectIssues(tree.right, path, issues);
  } else if (tree.code === "prepend") {
    path.push(tree.key);
    _collectIssues(tree.tree, path, issues);
    path.pop();
  } else {
    const finalPath = path.slice();
    if (tree.path) {
      finalPath.push(...tree.path);
    }
    if (
      tree.code === "custom_error" &&
      typeof tree.error !== "string" &&
      tree.error?.path
    ) {
      finalPath.push(...tree.error.path);
    }
    issues.push({ ...tree, path: finalPath });
  }
}

function collectIssues(tree: IssueTree): Issue[] {
  const issues: Issue[] = [];
  const path: Key[] = [];
  _collectIssues(tree, path, issues);
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
    if (tree.path) {
      path.push(...tree.path);
    }
    if (
      tree.code === "custom_error" &&
      typeof tree.error !== "string" &&
      tree.error?.path
    ) {
      path.push(...tree.error.path);
    }
    return { ...tree, path };
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

  const path = issue.path || [];

  let message = "validation failed";
  if (issue.code === "invalid_type") {
    message = `expected ${separatedList(issue.expected, "or")}`;
  } else if (issue.code === "invalid_literal") {
    message = `expected ${separatedList(
      issue.expected.map(formatLiteral),
      "or"
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

  let msg = `${issue.code} at .${path.join(".")} (${message})`;
  if (count === 2) {
    msg += ` (+ 1 other issue)`;
  } else if (count > 2) {
    msg += ` (+ ${count - 1} other issues)`;
  }
  return msg;
}

export class ValitaError extends Error {
  private readonly issueTree!: IssueTree;

  constructor(issueTree: IssueTree) {
    super(formatIssueTree(issueTree));
    Object.setPrototypeOf(this, new.target.prototype);
    Object.defineProperty(this, "issueTree", { value: issueTree });
    this.name = new.target.name;
  }

  get issues(): readonly Issue[] {
    const issues = collectIssues(this.issueTree);
    Object.defineProperty(this, "issues", { value: issues });
    return issues;
  }
}

interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

class Err {
  readonly ok = false;

  constructor(private readonly issueTree: IssueTree) {}

  get issues(): readonly Issue[] {
    const issues = collectIssues(this.issueTree);
    Object.defineProperty(this, "issues", { value: issues });
    return issues;
  }

  get message(): string {
    const message = formatIssueTree(this.issueTree);
    Object.defineProperty(this, "message", { value: message });
    return message;
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
  return new Err({ code: "custom_error", error });
}

export type { Ok, Err };
export type ValitaResult<V> = Ok<V> | Err;

type RawResult<T> = true | Readonly<{ code: "ok"; value: T }> | IssueTree;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeSet(
  obj: Record<string, unknown>,
  key: string,
  value: unknown
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

function hasTerminal(type: AbstractType, name: TerminalType["name"]): boolean {
  let has = false;
  type.toTerminals((t) => {
    has = has || t.name === name;
  });
  return has;
}

const Nothing: unique symbol = Symbol();

const enum FuncMode {
  PASS = 0,
  STRICT = 1,
  STRIP = 2,
}
type Func<T> = (v: unknown, mode: FuncMode) => RawResult<T>;

type ParseOptions = {
  mode: "passthrough" | "strict" | "strip";
};

export type Infer<T extends AbstractType> = T extends AbstractType<infer I>
  ? I
  : never;

abstract class AbstractType<Output = unknown> {
  abstract readonly name: string;
  abstract toTerminals(func: (t: TerminalType) => void): void;
  abstract func(v: unknown, mode: FuncMode): RawResult<Output>;

  try<T extends AbstractType>(
    this: T,
    v: unknown,
    options?: Partial<ParseOptions>
  ): ValitaResult<Infer<T>> {
    let mode: FuncMode = FuncMode.STRICT;
    if (options && options.mode === "passthrough") {
      mode = FuncMode.PASS;
    } else if (options && options.mode === "strip") {
      mode = FuncMode.STRIP;
    }

    const r = this.func(v, mode);
    if (r === true) {
      return { ok: true, value: v as Infer<T> };
    } else if (r.code === "ok") {
      return { ok: true, value: r.value as Infer<T> };
    } else {
      return new Err(r);
    }
  }

  parse<T extends AbstractType>(
    this: T,
    v: unknown,
    options?: Partial<ParseOptions>
  ): Infer<T> {
    let mode: FuncMode = FuncMode.STRICT;
    if (options && options.mode === "passthrough") {
      mode = FuncMode.PASS;
    } else if (options && options.mode === "strip") {
      mode = FuncMode.STRIP;
    }

    const r = this.func(v, mode);
    if (r === true) {
      return v as Infer<T>;
    } else if (r.code === "ok") {
      return r.value as Infer<T>;
    } else {
      throw new ValitaError(r);
    }
  }

  optional(): Optional<Output> {
    return new Optional(this);
  }

  default<T extends Literal>(
    defaultValue: T
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
    error?: CustomError
  ): Type<T> {
    const err: Issue = { code: "custom_error", error };
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

const isOptional: unique symbol = Symbol();
type IfOptional<T extends AbstractType, Then, Else> = T extends Optional
  ? Then
  : Else;

abstract class Type<Output = unknown> extends AbstractType<Output> {
  protected declare readonly [isOptional] = false;

  toTerminals(func: (t: TerminalType) => void): void {
    func(this as TerminalType);
  }
}

class Optional<Output = unknown> extends AbstractType<Output | undefined> {
  protected declare readonly [isOptional] = true;

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
}

type ObjectShape = Record<string, AbstractType>;

type Optionals<T extends ObjectShape> = {
  [K in keyof T]: IfOptional<T[K], K, never>;
}[keyof T];

type ObjectOutput<
  T extends ObjectShape,
  R extends AbstractType | undefined
> = PrettyIntersection<
  {
    [K in Optionals<T>]?: Infer<T[K]>;
  } & {
    [K in Exclude<keyof T, Optionals<T>>]: Infer<T[K]>;
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

type Obj = Record<string, unknown>;

function assignEnumerable(to: Obj, from: Obj): Obj {
  for (const key in from) {
    safeSet(to, key, from[key]);
  }
  return to;
}

function addResult(
  objResult: RawResult<Obj>,
  obj: Obj,
  key: string,
  value: unknown,
  keyResult: RawResult<unknown>,
  assign: (to: Obj, from: Obj) => Obj
): RawResult<Obj> {
  if (keyResult === true) {
    if (objResult !== true && objResult.code === "ok" && value !== Nothing) {
      safeSet(objResult.value, key, value);
    }
    return objResult;
  } else if (keyResult.code === "ok") {
    if (objResult === true) {
      const copy = assign({}, obj);
      safeSet(copy, key, keyResult.value);
      return { code: "ok", value: copy };
    } else if (objResult.code === "ok") {
      safeSet(objResult.value, key, keyResult.value);
      return objResult;
    } else {
      return objResult;
    }
  } else {
    return prependIssue(prependPath(key, keyResult), objResult);
  }
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

// Preallocate a "template" array for fast cloning, in case the BitSet needs to
// be upgraded to an array. This will only become useful when keys.length > 32.
function createBitsetTemplate(bits: number): number[] {
  const template = [0 | 0];
  for (let i = 32; i < bits; i += 32) {
    template.push(0 | 0);
  }
  return template;
}

// Set a bit in position `index` to one and return the updated bitset.
// This function may or may not mutate `bits` in-place.
function setBit(template: number[], bits: BitSet, index: number): BitSet {
  if (typeof bits !== "number") {
    bits[index >> 5] |= 1 << index % 32;
    return bits;
  } else if (index < 32) {
    return bits | (1 << index);
  } else {
    template[0] = bits | 0;
    return setBit(template, template.slice(), index);
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
  Rest extends AbstractType | undefined = AbstractType | undefined
> extends Type<ObjectOutput<Shape, Rest>> {
  readonly name = "object";

  private _func?: Func<ObjectOutput<Shape, Rest>>;

  constructor(
    readonly shape: Shape,
    private readonly restType: Rest,
    private readonly checks?: {
      func: (v: unknown) => boolean;
      issue: Issue;
    }[]
  ) {
    super();
  }

  check(
    func: (v: ObjectOutput<Shape, Rest>) => boolean,
    error?: CustomError
  ): ObjectType<Shape, Rest> {
    const issue = { code: "custom_error", error } as const;
    return new ObjectType(this.shape, this.restType, [
      ...(this.checks ?? []),
      {
        func: func as (v: unknown) => boolean,
        issue,
      },
    ]);
  }

  func(obj: Obj, mode: FuncMode): RawResult<ObjectOutput<Shape, Rest>> {
    let func = this._func;
    if (func === undefined) {
      func = createObjectMatcher(this.shape, this.restType, this.checks);
      this._func = func;
    }
    return func(obj, mode);
  }

  rest<R extends Type>(restType: R): ObjectType<Shape, R> {
    return new ObjectType(this.shape, restType);
  }

  extend<S extends ObjectShape>(
    shape: S
  ): ObjectType<Omit<Shape, keyof S> & S, Rest> {
    return new ObjectType(
      { ...this.shape, ...shape } as Omit<Shape, keyof S> & S,
      this.restType
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
      rest as Rest extends AbstractType<infer I> ? Optional<I> : undefined
    );
  }
}

function createObjectMatcher<
  Shape extends ObjectShape = ObjectShape,
  Rest extends AbstractType | undefined = AbstractType | undefined
>(
  shape: Shape,
  restType: Rest,
  checks?: {
    func: (v: unknown) => boolean;
    issue: Issue;
  }[]
): Func<ObjectOutput<Shape, Rest>> {
  const requiredKeys: string[] = [];
  const optionalKeys: string[] = [];
  for (const key in shape) {
    if (hasTerminal(shape[key], "optional")) {
      optionalKeys.push(key);
    } else {
      requiredKeys.push(key);
    }
  }

  const requiredCount = requiredKeys.length | 0;
  const optionalCount = optionalKeys.length | 0;
  const totalCount = (requiredCount + optionalCount) | 0;

  const keys = [...requiredKeys, ...optionalKeys];
  const types = keys.map((key) => shape[key]);

  const bitsTemplate = createBitsetTemplate(totalCount);
  const invertedIndexes = Object.create(null);
  keys.forEach((key, index) => {
    invertedIndexes[key] = ~index;
  });

  const invalidType: Issue = {
    code: "invalid_type",
    expected: ["object"],
  };
  const missingValues: Issue[] = requiredKeys.map((key) => ({
    code: "missing_value",
    path: [key],
  }));

  function assignKnown(to: Obj, from: Obj): Obj {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = from[key];
      if (i < requiredCount || value !== undefined || key in from) {
        safeSet(to, key, value);
      }
    }
    return to;
  }

  function assignAll(to: Obj, from: Obj): Obj {
    return assignKnown(assignEnumerable(to, from), from);
  }

  function checkRemainingKeys(
    initialResult: RawResult<Obj>,
    obj: Obj,
    mode: FuncMode,
    bits: BitSet,
    assign: (to: Obj, from: Obj) => Obj
  ): RawResult<Obj> {
    let result = initialResult;
    for (let i = 0; i < totalCount; i++) {
      if (!getBit(bits, i)) {
        const key = keys[i];
        const value = key in obj ? obj[key] : Nothing;
        if (i < requiredCount && value === Nothing) {
          result = prependIssue(missingValues[i], result);
        } else {
          result = addResult(
            result,
            obj,
            key,
            value,
            types[i].func(value, mode),
            assign
          );
        }
      }
    }
    return result;
  }

  function pass(obj: Obj, mode: FuncMode): RawResult<Obj> {
    let result: RawResult<Obj> = true;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      let value: unknown = obj[key];
      if (value === undefined && !(key in obj)) {
        if (i < requiredCount) {
          result = prependIssue(missingValues[i], result);
          continue;
        }
        value = Nothing;
      }

      result = addResult(
        result,
        obj,
        key,
        value,
        types[i].func(value, mode),
        assignKnown
      );
    }
    return result;
  }

  function strict(obj: Obj, mode: FuncMode): RawResult<Obj> {
    let result: RawResult<Obj> = true;
    let unrecognized: Key[] | undefined = undefined;
    let seenBits: BitSet = 0;
    let seenCount = 0;

    for (const key in obj) {
      const value = obj[key];
      const index = ~invertedIndexes[key];
      if (index >= 0) {
        seenCount++;
        seenBits = setBit(bitsTemplate, seenBits, index);
        result = addResult(
          result,
          obj,
          key,
          value,
          types[index].func(value, mode),
          assignKnown
        );
      } else if (mode === FuncMode.STRIP) {
        result =
          result === true
            ? { code: "ok", value: assignKnown({}, obj) }
            : result;
      } else if (unrecognized === undefined) {
        unrecognized = [key];
      } else {
        unrecognized.push(key);
      }
    }

    if (seenCount < totalCount) {
      result = checkRemainingKeys(result, obj, mode, seenBits, assignKnown);
    }

    return unrecognized === undefined
      ? result
      : prependIssue(
          {
            code: "unrecognized_keys",
            keys: unrecognized,
          },
          result
        );
  }

  function withRest(
    rest: AbstractType,
    obj: Obj,
    mode: FuncMode
  ): RawResult<Obj> {
    if (rest.name === "unknown" && totalCount === 0) {
      return true;
    }

    let result: RawResult<Obj> = true;
    let seenBits: BitSet = 0;
    let seenCount = 0;

    for (const key in obj) {
      const value = obj[key];
      const index = ~invertedIndexes[key];
      if (index >= 0) {
        seenCount++;
        seenBits = setBit(bitsTemplate, seenBits, index);
        result = addResult(
          result,
          obj,
          key,
          value,
          types[index].func(value, mode),
          assignEnumerable
        );
      } else {
        result = addResult(
          result,
          obj,
          key,
          value,
          rest.func(value, mode),
          assignEnumerable
        );
      }
    }

    if (seenCount < totalCount) {
      result = checkRemainingKeys(result, obj, mode, seenBits, assignAll);
    }
    return result;
  }

  function runChecks(
    obj: Record<string, unknown>,
    result: RawResult<Obj>
  ): RawResult<ObjectOutput<Shape, Rest>> {
    if ((result === true || result.code === "ok") && checks) {
      const value = result === true ? obj : result.value;
      for (let i = 0; i < checks.length; i++) {
        if (!checks[i].func(value)) {
          return checks[i].issue;
        }
      }
    }
    return result as RawResult<ObjectOutput<Shape, Rest>>;
  }

  function func(
    obj: unknown,
    mode: FuncMode
  ): RawResult<ObjectOutput<Shape, Rest>> {
    if (!isObject(obj)) {
      return invalidType;
    }

    if (restType) {
      return runChecks(obj, withRest(restType, obj, mode));
    } else if (mode === FuncMode.PASS) {
      return runChecks(obj, pass(obj, mode));
    } else {
      return runChecks(obj, strict(obj, mode));
    }
  }

  return func;
}

type TupleOutput<T extends Type[]> = {
  [K in keyof T]: T[K] extends Type<infer U> ? U : never;
};

type ArrayOutput<Head extends Type[], Rest extends Type | undefined> = [
  ...TupleOutput<Head>,
  ...(Rest extends Type ? Infer<Rest>[] : [])
];

class ArrayType<
  Head extends Type[] = Type[],
  Rest extends Type | undefined = Type | undefined
> extends Type<ArrayOutput<Head, Rest>> {
  readonly name = "array";

  private readonly rest: Type;
  private readonly invalidType: Issue;
  private readonly invalidLength: Issue;
  private readonly minLength: number;
  private readonly maxLength: number;

  constructor(readonly head: Head, rest?: Rest) {
    super();

    this.rest = rest ?? never();
    this.minLength = this.head.length;
    this.maxLength = rest ? Infinity : this.minLength;
    this.invalidType = { code: "invalid_type", expected: ["array"] };
    this.invalidLength = {
      code: "invalid_length",
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

function toBaseType(v: unknown): BaseType {
  const type = typeof v;
  if (type !== "object") {
    return type as BaseType;
  } else if (v === null) {
    return "null";
  } else if (Array.isArray(v)) {
    return "array";
  } else {
    return type;
  }
}

function dedup<T>(arr: T[]): T[] {
  const output: T[] = [];
  const seen = new Set();
  for (let i = 0; i < arr.length; i++) {
    if (!seen.has(arr[i])) {
      output.push(arr[i]);
      seen.add(arr[i]);
    }
  }
  return output;
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

function createUnionObjectMatchers(
  t: { root: AbstractType; terminal: TerminalType }[]
): {
  key: string;
  optional?: AbstractType;
  matcher: (
    rootValue: unknown,
    value: unknown,
    mode: FuncMode
  ) => RawResult<unknown>;
}[] {
  const objects: {
    root: AbstractType;
    terminal: TerminalType & { name: "object" };
  }[] = [];
  t.forEach(({ root, terminal }) => {
    if (terminal.name === "object") {
      objects.push({ root, terminal });
    }
  });
  const shapes = objects.map(({ terminal }) => terminal.shape);
  const common = findCommonKeys(shapes);
  const discriminants = common.filter((key) => {
    const types = new Map<BaseType, number[]>();
    const literals = new Map<unknown, number[]>();
    let optionals = [] as number[];
    let unknowns = [] as number[];
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i];
      shape[key].toTerminals((terminal) => {
        if (terminal.name === "never") {
          // skip
        } else if (terminal.name === "unknown") {
          unknowns.push(i);
        } else if (terminal.name === "optional") {
          optionals.push(i);
        } else if (terminal.name === "literal") {
          const options = literals.get(terminal.value) || [];
          options.push(i);
          literals.set(terminal.value, options);
        } else {
          const options = types.get(terminal.name) || [];
          options.push(i);
          types.set(terminal.name, options);
        }
      });
    }
    optionals = dedup(optionals);
    if (optionals.length > 1) {
      return false;
    }
    unknowns = dedup(unknowns);
    if (unknowns.length > 1) {
      return false;
    }
    literals.forEach((found, value) => {
      const options = types.get(toBaseType(value));
      if (options) {
        options.push(...found);
        literals.delete(value);
      }
    });
    let success = true;
    literals.forEach((found) => {
      if (dedup(found.concat(unknowns)).length > 1) {
        success = false;
      }
    });
    types.forEach((found) => {
      if (dedup(found.concat(unknowns)).length > 1) {
        success = false;
      }
    });
    return success;
  });
  return discriminants.map((key) => {
    const flattened = flatten(
      objects.map(({ root, terminal }) => ({
        root,
        type: terminal.shape[key],
      }))
    );
    let optional: AbstractType | undefined = undefined;
    for (let i = 0; i < flattened.length; i++) {
      const { root, terminal } = flattened[i];
      if (terminal.name === "optional") {
        optional = root;
        break;
      }
    }
    return {
      key,
      optional,
      matcher: createUnionBaseMatcher(flattened, [key]),
    };
  });
}

function createUnionBaseMatcher(
  t: { root: AbstractType; terminal: TerminalType }[],
  path?: Key[]
): (rootValue: unknown, value: unknown, mode: FuncMode) => RawResult<unknown> {
  const order = new Map<AbstractType, number>();
  t.forEach(({ root }, i) => {
    order.set(root, order.get(root) ?? i);
  });
  const byOrder = (a: AbstractType, b: AbstractType): number => {
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  };

  const expectedTypes = [] as BaseType[];
  const literals = new Map<unknown, AbstractType[]>();
  const types = new Map<BaseType, AbstractType[]>();
  let unknowns = [] as AbstractType[];
  let optionals = [] as AbstractType[];
  t.forEach(({ root, terminal }) => {
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
      expectedTypes.push(toBaseType(terminal.value));
    } else {
      const roots = types.get(terminal.name) || [];
      roots.push(root);
      types.set(terminal.name, roots);
      expectedTypes.push(terminal.name);
    }
  });

  literals.forEach((roots, value) => {
    const options = types.get(toBaseType(value));
    if (options) {
      options.push(...roots);
      literals.delete(value);
    }
  });

  unknowns = dedup(unknowns).sort(byOrder);
  optionals = dedup(optionals).sort(byOrder);
  types.forEach((roots, type) =>
    types.set(type, dedup(roots.concat(unknowns).sort(byOrder)))
  );
  literals.forEach((roots, value) =>
    literals.set(value, dedup(roots.concat(unknowns)).sort(byOrder))
  );

  const expectedLiterals = [] as Literal[];
  literals.forEach((_, value) => {
    expectedLiterals.push(value as Literal);
  });
  const invalidType: Issue = {
    code: "invalid_type",
    path,
    expected: dedup(expectedTypes),
  };
  const invalidLiteral: Issue = {
    code: "invalid_literal",
    path,
    expected: expectedLiterals,
  };
  const missingValue: Issue = {
    code: "missing_value",
    path,
  };

  const literalTypes = new Set(expectedLiterals.map(toBaseType));
  return (rootValue, value, mode) => {
    let count = 0;
    let issueTree: IssueTree | undefined;

    if (value === Nothing) {
      for (let i = 0; i < optionals.length; i++) {
        const r = optionals[i].func(rootValue, mode);
        if (r === true || r.code === "ok") {
          return r;
        }
        issueTree = joinIssues(issueTree, r);
        count++;
      }
      if (!issueTree) {
        return missingValue;
      } else if (count > 1) {
        return { code: "invalid_union", tree: issueTree };
      } else {
        return issueTree;
      }
    }

    const type = toBaseType(value);
    const options = literals.get(value) || types.get(type) || unknowns;
    for (let i = 0; i < options.length; i++) {
      const r = options[i].func(rootValue, mode);
      if (r === true || r.code === "ok") {
        return r;
      }
      issueTree = joinIssues(issueTree, r);
      count++;
    }
    if (!issueTree) {
      return literalTypes.has(type) ? invalidLiteral : invalidType;
    } else if (count > 1) {
      return { code: "invalid_union", tree: issueTree };
    } else {
      return issueTree;
    }
  };
}

function flatten(
  t: { root: AbstractType; type: AbstractType }[]
): { root: AbstractType; terminal: TerminalType }[] {
  const result: { root: AbstractType; terminal: TerminalType }[] = [];
  t.forEach(({ root, type }) =>
    type.toTerminals((terminal) => {
      result.push({ root, terminal });
    })
  );
  return result;
}

function createUnionMatcher<T extends Type[]>(
  options: T
): Func<Infer<T[number]>> {
  const flattened = flatten(options.map((root) => ({ root, type: root })));
  const objects = createUnionObjectMatchers(flattened);
  const base = createUnionBaseMatcher(flattened);
  const hasUnknown = options.some((option) => hasTerminal(option, "unknown"));

  function func(v: unknown, mode: FuncMode): RawResult<Infer<T[number]>> {
    if (!hasUnknown && objects.length > 0 && isObject(v)) {
      const item = objects[0];
      let value = v[item.key];
      if (value === undefined && !(item.key in v)) {
        value = Nothing;
      }
      return item.matcher(v, value, mode) as RawResult<Infer<T[number]>>;
    }
    return base(v, v, mode) as RawResult<Infer<T[number]>>;
  }
  return func;
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
      func = createUnionMatcher(this.options);
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
    protected readonly transform: Func<unknown>
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
  private readonly issue: Issue = { code: "invalid_type", expected: [] };
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
  private readonly issue: Issue = {
    code: "invalid_type",
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
  private readonly issue: Issue = {
    code: "invalid_type",
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
  private readonly issue: Issue = {
    code: "invalid_type",
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
  private readonly issue: Issue = {
    code: "invalid_type",
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
  private readonly issue: Issue = {
    code: "invalid_type",
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
  private readonly issue: Issue = {
    code: "invalid_type",
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
  private readonly issue: Issue;
  constructor(readonly value: Out) {
    super();
    this.issue = { code: "invalid_literal", expected: [value] };
  }
  func(v: unknown, _: FuncMode): RawResult<Out> {
    return v === this.value ? true : this.issue;
  }
}
function literal<T extends Literal>(value: T): Type<T> {
  return new LiteralType(value);
}

function object<T extends Record<string, Type | Optional>>(
  obj: T
): ObjectType<T, undefined> {
  return new ObjectType(obj, undefined);
}

function record<T extends Type>(valueType?: T): Type<Record<string, Infer<T>>> {
  return new ObjectType({} as Record<string, never>, valueType ?? unknown());
}

function array<T extends Type>(item: T): ArrayType<[], T> {
  return new ArrayType([], item);
}

function tuple<T extends [] | [Type, ...Type[]]>(
  items: T
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
