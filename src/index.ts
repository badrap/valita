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
  | I<"invalid_literal", { expected: Literal[] }>
  | I<"invalid_length", { minLength: number; maxLength: number }>
  | I<"missing_key", { key: Key }>
  | I<"unrecognized_key", { key: Key }>
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

function orList(list: string[]): string {
  if (list.length === 0) {
    return "nothing";
  }
  const last = list[list.length - 1];
  if (list.length < 2) {
    return last;
  }
  return `${list.slice(0, -1).join(", ")} or ${last}`;
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
    message = `expected ${orList(issue.expected)}`;
  } else if (issue.code === "invalid_literal") {
    message = `expected ${orList(issue.expected.map(formatLiteral))}`;
  } else if (issue.code === "missing_key") {
    message = `missing key ${formatLiteral(issue.key)}`;
  } else if (issue.code === "unrecognized_key") {
    message = `unrecognized key ${formatLiteral(issue.key)}`;
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
  constructor(private readonly issueTree: IssueTree) {
    super(formatIssueTree(issueTree));
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }

  get issues(): readonly Issue[] {
    const issues = collectIssues(this.issueTree);
    Object.defineProperty(this, "issues", {
      value: issues,
      writable: false,
    });
    return issues;
  }
}

type Ok<T> = Readonly<{
  ok: true;
  value: T;
}>;

function ok<T extends Literal>(value: T): Ok<T>;
function ok<T>(value: T): Ok<T>;
function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

class Err {
  readonly ok = false;

  constructor(private readonly issueTree: IssueTree) {}

  get issues(): readonly Issue[] {
    const issues = collectIssues(this.issueTree);
    Object.defineProperty(this, "issues", {
      value: issues,
      writable: false,
    });
    return issues;
  }

  get message(): string {
    const message = formatIssueTree(this.issueTree);
    Object.defineProperty(this, "message", {
      value: message,
      writable: false,
    });
    return message;
  }

  throw(): never {
    throw new ValitaError(this.issueTree);
  }
}

function err<E extends CustomError>(error?: E): Err {
  return new Err({ code: "custom_error", error });
}

export type ValitaResult<V> = Ok<V> | Err;

type RawResult<T> = true | Readonly<{ code: "ok"; value: T }> | IssueTree;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toTerminals(type: AbstractType): TerminalType[] {
  const result: TerminalType[] = [];
  type.toTerminals(result);
  return result;
}

function hasTerminal(type: AbstractType, name: TerminalType["name"]): boolean {
  return toTerminals(type).some((t) => t.name === name);
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
  abstract genFunc(): Func<Output>;
  abstract toTerminals(into: TerminalType[]): void;

  get func(): Func<Output> {
    const f = this.genFunc();
    Object.defineProperty(this, "func", {
      value: f,
      writable: false,
    });
    return f;
  }

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
    const r = this.try(v, options);
    if (r.ok) {
      return r.value;
    } else {
      return r.throw();
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
    return new DefaultType(this, defaultValue);
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

declare const isOptional: unique symbol;
type IfOptional<T extends AbstractType, Then, Else> = T extends Optional
  ? Then
  : Else;

abstract class Type<Output = unknown> extends AbstractType<Output> {
  protected declare readonly [isOptional] = false;
}

class Optional<Output = unknown> extends AbstractType<Output | undefined> {
  protected declare readonly [isOptional] = true;

  readonly name = "optional";
  constructor(private readonly type: AbstractType<Output>) {
    super();
  }
  genFunc(): Func<Output | undefined> {
    const func = this.type.func;
    return (v, mode) => {
      return v === undefined || v === Nothing ? true : func(v, mode);
    };
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
    into.push(new UndefinedType());
    this.type.toTerminals(into);
  }
}

class DefaultType<Output, DefaultValue> extends Type<
  Exclude<Output, undefined> | DefaultValue
> {
  readonly name = "default";
  constructor(
    private readonly type: AbstractType<Output>,
    private readonly defaultValue: DefaultValue
  ) {
    super();
  }
  genFunc(): Func<Exclude<Output, undefined> | DefaultValue> {
    const func = this.type.func;
    const undefinedOutput: RawResult<DefaultValue> =
      this.defaultValue === undefined
        ? true
        : { code: "ok", value: this.defaultValue };
    const nothingOutput: RawResult<DefaultValue> = {
      code: "ok",
      value: this.defaultValue,
    };
    return (v, mode) => {
      if (v === undefined) {
        return undefinedOutput;
      } else if (v === Nothing) {
        return nothingOutput;
      } else {
        const result = func(v, mode);
        if (
          result !== true &&
          result.code === "ok" &&
          result.value === undefined
        ) {
          return nothingOutput;
        }
        return result as RawResult<Exclude<Output, undefined>>;
      }
    };
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this.type.optional());
    this.type.toTerminals(into);
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

class ObjectType<
  Shape extends ObjectShape = ObjectShape,
  Rest extends AbstractType | undefined = AbstractType | undefined
> extends Type<ObjectOutput<Shape, Rest>> {
  readonly name = "object";

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

  toTerminals(into: TerminalType[]): void {
    into.push(this as ObjectType);
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

  genFunc(): Func<ObjectOutput<Shape, Rest>> {
    const shape = this.shape;
    const checks = this.checks;
    const invalidType: Issue = { code: "invalid_type", expected: ["object"] };

    const requiredKeys: string[] = [];
    const optionalKeys: string[] = [];
    const requiredFuncs: Func<unknown>[] = [];
    const optionalFuncs: Func<unknown>[] = [];
    for (const key in shape) {
      if (hasTerminal(shape[key], "optional")) {
        optionalKeys.push(key);
        optionalFuncs.push(shape[key].func);
      } else {
        requiredKeys.push(key);
        requiredFuncs.push(shape[key].func);
      }
    }

    const requiredCount = requiredKeys.length;
    const optionalCount = optionalKeys.length;

    const keys = [...requiredKeys, ...optionalKeys];
    const funcs = [...requiredFuncs, ...optionalFuncs];
    const invertedIndexes: Record<string, number> = Object.create(null);
    keys.forEach((key, index) => {
      invertedIndexes[key] = ~index;
    });

    const copyObj = (obj: Record<string, unknown>): Record<string, unknown> => {
      const result = {} as Record<string, unknown>;
      for (let i = 0; i < requiredKeys.length; i++) {
        const key = requiredKeys[i];
        if (key in obj) {
          result[key] = obj[key];
        }
      }
      return result;
    };

    const addResult = (
      objResult: RawResult<Record<string, unknown>>,
      func: Func<unknown>,
      obj: Record<string, unknown>,
      key: string,
      value: unknown,
      mode: FuncMode
    ): RawResult<Record<string, unknown>> => {
      const keyResult = func(value, mode);
      if (keyResult === true) {
        if (
          objResult !== true &&
          objResult.code === "ok" &&
          value !== Nothing
        ) {
          objResult.value[key] = value;
        }
        return objResult;
      } else if (keyResult.code === "ok") {
        if (objResult === true) {
          const copy = copyObj(obj);
          copy[key] = keyResult.value;
          return { code: "ok", value: copy };
        } else if (objResult.code === "ok") {
          objResult.value[key] = keyResult.value;
          return objResult;
        } else {
          return objResult;
        }
      } else if (objResult === true || objResult.code === "ok") {
        return prependPath(key, keyResult);
      } else {
        return joinIssues(objResult, prependPath(key, keyResult));
      }
    };

    const checkRequired = (
      result: RawResult<Record<string, unknown>>,
      obj: Record<string, unknown>,
      mode: FuncMode
    ): RawResult<Record<string, unknown>> => {
      for (let i = 0; i < requiredKeys.length; i++) {
        const key = requiredKeys[i];
        if (!(key in obj)) {
          return { code: "missing_key", key };
        }
        if (!Object.prototype.propertyIsEnumerable.call(obj, key)) {
          result = addResult(
            result,
            requiredFuncs[i],
            obj,
            key,
            obj[key],
            mode
          );
        }
      }
      return result;
    };

    const checkOptional = (
      result: RawResult<Record<string, unknown>>,
      obj: Record<string, unknown>,
      mode: FuncMode
    ): RawResult<Record<string, unknown>> => {
      for (let i = 0; i < optionalKeys.length; i++) {
        const key = optionalKeys[i];

        let value: unknown = Nothing;
        if (key in obj) {
          if (Object.prototype.propertyIsEnumerable.call(obj, key)) {
            continue;
          }
          value = obj[key];
        }
        result = addResult(result, optionalFuncs[i], obj, key, value, mode);
      }
      return result;
    };

    const strict = (
      obj: Record<string, unknown>
    ): RawResult<ObjectOutput<Shape, Rest>> => {
      let result: RawResult<Record<string, unknown>> = true;

      let requiredSeen = 0;
      let optionalSeen = 0;

      for (const key in obj) {
        const index = ~invertedIndexes[key];
        if (index >= 0) {
          if (index < requiredCount) {
            requiredSeen++;
          } else {
            optionalSeen++;
          }

          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result = addResult(
              result,
              funcs[index],
              obj,
              key,
              obj[key],
              FuncMode.STRICT
            );
          }
        } else {
          return { code: "unrecognized_key", key };
        }
      }

      if (requiredSeen < requiredCount) {
        result = checkRequired(result, obj, FuncMode.STRICT);
      }
      if (optionalSeen < optionalCount) {
        result = checkOptional(result, obj, FuncMode.STRICT);
      }
      return result as RawResult<ObjectOutput<Shape, Rest>>;
    };

    const pass = (
      obj: Record<string, unknown>
    ): RawResult<ObjectOutput<Shape, Rest>> => {
      let result: RawResult<Record<string, unknown>> = true;

      let requiredSeen = 0;
      let optionalSeen = 0;

      for (const key in obj) {
        const index = ~invertedIndexes[key];
        if (index >= 0) {
          if (index < requiredCount) {
            requiredSeen++;
          } else {
            optionalSeen++;
          }

          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result = addResult(
              result,
              funcs[index],
              obj,
              key,
              obj[key],
              FuncMode.PASS
            );
          }
        }
      }

      if (requiredSeen < requiredCount) {
        result = checkRequired(result, obj, FuncMode.PASS);
      }
      if (optionalSeen < optionalCount) {
        result = checkOptional(result, obj, FuncMode.PASS);
      }
      return result as RawResult<ObjectOutput<Shape, Rest>>;
    };

    const strip = (
      obj: Record<string, unknown>
    ): RawResult<ObjectOutput<Shape, Rest>> => {
      let result: RawResult<Record<string, unknown>> = {
        code: "ok",
        value: {},
      };

      let requiredSeen = 0;
      let optionalSeen = 0;

      for (const key in obj) {
        const index = ~invertedIndexes[key];
        if (index >= 0) {
          if (index < requiredCount) {
            requiredSeen++;
          } else {
            optionalSeen++;
          }

          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result = addResult(
              result,
              funcs[index],
              obj,
              key,
              obj[key],
              FuncMode.STRIP
            );
          }
        }
      }

      if (requiredSeen < requiredCount) {
        result = checkRequired(result, obj, FuncMode.STRIP);
      }
      if (optionalSeen < optionalCount) {
        result = checkOptional(result, obj, FuncMode.STRIP);
      }
      return result as RawResult<ObjectOutput<Shape, Rest>>;
    };

    if (this.restType) {
      const rest = this.restType.func;
      return (obj, mode) => {
        if (!isObject(obj)) {
          return invalidType;
        }

        let result: RawResult<Record<string, unknown>> = true;
        let requiredSeen = 0;
        let optionalSeen = 0;

        for (const key in obj) {
          const index = ~invertedIndexes[key];
          if (index >= 0) {
            if (index < requiredCount) {
              requiredSeen++;
            } else {
              optionalSeen++;
            }

            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              result = addResult(
                result,
                funcs[index],
                obj,
                key,
                obj[key],
                mode
              );
            }
          } else {
            result = addResult(result, rest, obj, key, obj[key], mode);
          }
        }

        if (requiredSeen < requiredCount) {
          result = checkRequired(result, obj, mode);
        }
        if (optionalSeen < optionalCount) {
          result = checkOptional(result, obj, mode);
        }

        if ((result === true || result.code === "ok") && checks) {
          const value = result === true ? obj : result.value;
          for (let i = 0; i < checks.length; i++) {
            if (!checks[i].func(value)) {
              return checks[i].issue;
            }
          }
        }
        return result as RawResult<ObjectOutput<Shape, Rest>>;
      };
    }

    return (obj, mode) => {
      if (!isObject(obj)) {
        return invalidType;
      }

      let result: RawResult<ObjectOutput<Shape, Rest>>;
      if (mode === FuncMode.STRICT) {
        result = strict(obj);
      } else if (mode === FuncMode.STRIP) {
        result = strip(obj);
      } else {
        result = pass(obj);
      }

      if ((result === true || result.code === "ok") && checks) {
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

  constructor(readonly head: Head, readonly rest?: Rest) {
    super();
  }

  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }

  genFunc(): Func<ArrayOutput<Head, Rest>> {
    const headFuncs = this.head.map((t) => t.func);
    const restFunc = (this.rest ?? never()).func;
    const minLength = headFuncs.length;
    const maxLength = this.rest ? Infinity : minLength;

    const invalidType: Issue = { code: "invalid_type", expected: ["array"] };
    const invalidLength: Issue = {
      code: "invalid_length",
      minLength,
      maxLength,
    };

    return (arr, mode) => {
      if (!Array.isArray(arr)) {
        return invalidType;
      }
      const length = arr.length;
      if (length < minLength || length > maxLength) {
        return invalidLength;
      }

      let issueTree: IssueTree | undefined = undefined;
      let output: unknown[] = arr;
      for (let i = 0; i < arr.length; i++) {
        const func = i < minLength ? headFuncs[i] : restFunc;
        const r = func(arr[i], mode);
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
    };
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
  const output = [];
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

function createObjectMatchers(
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
      const terminals = toTerminals(shape[key]);
      for (let j = 0; j < terminals.length; j++) {
        const terminal = terminals[j];
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
      }
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
      matcher: createUnionMatcher(flattened, [key]),
    };
  });
}

function createUnionMatcher(
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
        return invalidType;
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
    toTerminals(type).forEach((terminal) => {
      result.push({ root, terminal });
    })
  );
  return result;
}

class UnionType<T extends Type[] = Type[]> extends Type<Infer<T[number]>> {
  readonly name = "union";

  constructor(readonly options: T) {
    super();
  }

  toTerminals(into: TerminalType[]): void {
    this.options.forEach((o) => o.toTerminals(into));
  }

  genFunc(): Func<Infer<T[number]>> {
    const flattened = flatten(
      this.options.map((root) => ({ root, type: root }))
    );
    const hasUnknown = hasTerminal(this, "unknown");
    const objects = createObjectMatchers(flattened);
    const base = createUnionMatcher(flattened);
    return (v, mode) => {
      if (!hasUnknown && objects.length > 0 && isObject(v)) {
        const item = objects[0];
        const value = v[item.key];
        if (value === undefined && !(item.key in v)) {
          if (item.optional) {
            return item.optional.func(Nothing, mode) as RawResult<
              Infer<T[number]>
            >;
          }
          return { code: "missing_key", key: item.key };
        }
        return item.matcher(v, value, mode) as RawResult<Infer<T[number]>>;
      }
      return base(v, v, mode) as RawResult<Infer<T[number]>>;
    };
  }

  optional(): Optional<Infer<T[number]>> {
    return new Optional(this);
  }
}

class NeverType extends Type<never> {
  readonly name = "never";
  genFunc(): Func<never> {
    const issue: Issue = { code: "invalid_type", expected: [] };
    return (_v, _mode) => issue;
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class UnknownType extends Type<unknown> {
  readonly name = "unknown";
  genFunc(): Func<unknown> {
    return (_v, _mode) => true;
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class NumberType extends Type<number> {
  readonly name = "number";
  genFunc(): Func<number> {
    const issue: Issue = { code: "invalid_type", expected: ["number"] };
    return (v, _mode) => (typeof v === "number" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class StringType extends Type<string> {
  readonly name = "string";
  genFunc(): Func<string> {
    const issue: Issue = { code: "invalid_type", expected: ["string"] };
    return (v, _mode) => (typeof v === "string" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class BigIntType extends Type<bigint> {
  readonly name = "bigint";
  genFunc(): Func<bigint> {
    const issue: Issue = { code: "invalid_type", expected: ["bigint"] };
    return (v, _mode) => (typeof v === "bigint" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class BooleanType extends Type<boolean> {
  readonly name = "boolean";
  genFunc(): Func<boolean> {
    const issue: Issue = { code: "invalid_type", expected: ["boolean"] };
    return (v, _mode) => (typeof v === "boolean" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class UndefinedType extends Type<undefined> {
  readonly name = "undefined";
  genFunc(): Func<undefined> {
    const issue: Issue = { code: "invalid_type", expected: ["undefined"] };
    return (v, _mode) => (v === undefined ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class NullType extends Type<null> {
  readonly name = "null";
  genFunc(): Func<null> {
    const issue: Issue = { code: "invalid_type", expected: ["null"] };
    return (v, _mode) => (v === null ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class LiteralType<Out extends Literal = Literal> extends Type<Out> {
  readonly name = "literal";
  constructor(readonly value: Out) {
    super();
  }
  genFunc(): Func<Out> {
    const value = this.value;
    const issue: Issue = { code: "invalid_literal", expected: [value] };
    return (v, _) => (v === value ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class TransformType<Output> extends Type<Output> {
  readonly name = "transform";
  constructor(
    protected readonly transformed: AbstractType,
    protected readonly transform: Func<unknown>
  ) {
    super();
  }
  genFunc(): Func<Output> {
    const chain: Func<unknown>[] = [];

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let next: AbstractType = this;
    while (next instanceof TransformType) {
      chain.push(next.transform);
      next = next.transformed;
    }
    chain.reverse();

    const func = next.func;
    const undef = { code: "ok", value: undefined } as RawResult<unknown>;
    return (v, mode) => {
      let result = func(v, mode);
      if (result !== true && result.code !== "ok") {
        return result;
      }

      let current: unknown;
      if (result !== true) {
        current = result.value;
      } else if (v === Nothing) {
        current = undefined;
        result = undef;
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
    };
  }
  toTerminals(into: TerminalType[]): void {
    this.transformed.toTerminals(into);
  }
}
class LazyType<T> extends Type<T> {
  readonly name = "lazy";
  constructor(private readonly definer: () => Type<T>) {
    super();
  }
  private get type(): Type<T> {
    const type = this.definer();
    Object.defineProperty(this, "type", {
      value: type,
      writable: false,
    });
    return type;
  }
  genFunc(): Func<T> {
    let func: Func<T> | undefined = undefined;
    return (v, mode) => {
      if (!func) {
        func = this.type.func;
      }
      return func(v, mode);
    };
  }
  toTerminals(into: TerminalType[]): void {
    this.type.toTerminals(into);
  }
}

function never(): Type<never> {
  return new NeverType();
}
function unknown(): Type<unknown> {
  return new UnknownType();
}
function number(): Type<number> {
  return new NumberType();
}
function bigint(): Type<bigint> {
  return new BigIntType();
}
function string(): Type<string> {
  return new StringType();
}
function boolean(): Type<boolean> {
  return new BooleanType();
}
function undefined_(): Type<undefined> {
  return new UndefinedType();
}
function null_(): Type<null> {
  return new NullType();
}
function literal<T extends Literal>(value: T): Type<T> {
  return new LiteralType(value);
}
function object<T extends Record<string, Type | Optional>>(
  obj: T
): ObjectType<T, undefined> {
  return new ObjectType(obj, undefined);
}
function record<T extends Type>(valueType: T): Type<Record<string, Infer<T>>> {
  return new ObjectType({} as Record<string, never>, valueType);
}
function array<T extends Type>(item: T): ArrayType<[], T> {
  return new ArrayType([], item);
}
function tuple<T extends [] | [Type, ...Type[]]>(
  items: T
): ArrayType<T, undefined> {
  return new ArrayType(items);
}
function union<T extends Type[]>(...options: T): Type<Infer<T[number]>> {
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
export type { ObjectType, UnionType, ArrayType };
