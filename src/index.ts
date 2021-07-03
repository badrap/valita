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

function joinIssues(left: IssueTree, right: IssueTree | undefined): IssueTree {
  return right ? { code: "join", left, right } : left;
}

function prependPath(key: Key, tree: IssueTree): IssueTree {
  return { code: "prepend", key, tree };
}

type Ok<T> =
  | true
  | Readonly<{
      code: "ok";
      value: T;
    }>;
type Result<T> = Ok<T> | IssueTree;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toTerminals(type: Type): TerminalType[] {
  const result: TerminalType[] = [];
  type.toTerminals(result);
  return result;
}

function hasTerminal(type: Type, name: TerminalType["name"]): boolean {
  return toTerminals(type).some((t) => t.name === name);
}

const Nothing: unique symbol = Symbol();

const enum FuncMode {
  PASS = 0,
  STRICT = 1,
  STRIP = 2,
}
type Func<T> = (v: unknown, mode: FuncMode) => Result<T>;

type ParseOptions = {
  mode: "passthrough" | "strict" | "strip";
};

type ChainResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error?: CustomError;
    };

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function err<E extends CustomError>(
  error?: E
): { ok: false; error?: CustomError } {
  return { ok: false, error };
}

type DefaultOutput<Output, DefaultValue> = Type<
  Exclude<Output, undefined> | DefaultValue,
  false
>;

abstract class Type<Output = unknown, Optional extends boolean = boolean> {
  protected declare _type: { output: Output; optional: Optional };

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

  parse<T extends Type>(
    this: T,
    v: unknown,
    options?: Partial<ParseOptions>
  ): Infer<T> {
    let mode: FuncMode = FuncMode.PASS;
    if (options && options.mode === "strict") {
      mode = FuncMode.STRICT;
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

  optional(): Type<Output | undefined, true> {
    return new OptionalType(this);
  }

  default<T extends Literal>(defaultValue: T): DefaultOutput<Output, T>;
  default<T>(defaultValue: T): DefaultOutput<Output, T>;
  default<T, This extends this>(
    this: This,
    defaultValue: T
  ): DefaultOutput<Output, T> {
    return (this.optional().map((v) =>
      v === undefined ? defaultValue : v
    ) as unknown) as DefaultOutput<Output, T>;
  }

  assert<T extends Output>(
    func: ((v: Output) => v is T) | ((v: Output) => boolean),
    error?: CustomError
  ): Type<T, false> {
    const err: Issue = { code: "custom_error", error };
    return new TransformType(this, (v) => (func(v as Output) ? true : err));
  }

  map<T>(func: (v: Output) => T): Type<T, false> {
    return new TransformType(this, (v) => ({
      code: "ok",
      value: func(v as Output),
    }));
  }

  chain<T>(func: (v: Output) => ChainResult<T>): Type<T, false> {
    return new TransformType(this, (v) => {
      const r = func(v as Output);
      if (r.ok) {
        return { code: "ok", value: r.value };
      } else {
        return { code: "custom_error", error: r.error };
      }
    });
  }
}

export type Infer<T extends Type> = T extends Type<infer I> ? I : never;

type ObjectShape = Record<string, Type>;

type Optionals<T extends ObjectShape> = {
  [K in keyof T]: Type<never, true> extends T[K] ? K : never;
}[keyof T];

type ObjectOutput<
  T extends ObjectShape,
  R extends Type | undefined
> = PrettyIntersection<
  {
    [K in Optionals<T>]?: Infer<T[K]>;
  } &
    {
      [K in Exclude<keyof T, Optionals<T>>]: Infer<T[K]>;
    } &
    (R extends Type<infer I> ? { [K: string]: I } : unknown)
>;

class ObjectType<
  Shape extends ObjectShape = ObjectShape,
  Rest extends Type | undefined = Type | undefined
> extends Type<ObjectOutput<Shape, Rest>, false> {
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
    const rest = this.restType ? this.restType.func : undefined;
    const invalidType: Issue = { code: "invalid_type", expected: ["object"] };
    const checks = this.checks;

    const keys: string[] = [];
    const funcs: Func<unknown>[] = [];
    const required: boolean[] = [];
    const knownKeys = Object.create(null);
    const shapeTemplate = {} as Record<string, unknown>;
    for (const key in shape) {
      keys.push(key);
      funcs.push(shape[key].func);
      knownKeys[key] = true;

      const isRequired = !hasTerminal(shape[key], "optional");
      required.push(isRequired);
      if (isRequired) {
        shapeTemplate[key] = undefined;
      }
    }

    return (obj, mode) => {
      if (!isObject(obj)) {
        return invalidType;
      }
      const strict = mode === FuncMode.STRICT;
      const strip = mode === FuncMode.STRIP;

      let issueTree: IssueTree | undefined = undefined;
      let output: Record<string, unknown> = obj;
      if (strict || strip || rest) {
        for (const key in obj) {
          if (!knownKeys[key]) {
            if (rest) {
              const r = rest(obj[key], mode);
              if (r !== true) {
                if (r.code === "ok") {
                  if (output === obj) {
                    output = { ...obj };
                  }
                  output[key] = r.value;
                } else {
                  issueTree = joinIssues(prependPath(key, r), issueTree);
                }
              }
            } else if (strict) {
              return { code: "unrecognized_key", key };
            } else if (strip) {
              output = { ...shapeTemplate };
              break;
            }
          }
        }
      }

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];

        let value = obj[key];
        if (value === undefined && !(key in obj)) {
          if (required[i]) {
            return { code: "missing_key", key };
          }
          value = Nothing;
        }
        const r = funcs[i](value, mode);
        if (r !== true) {
          if (r.code === "ok") {
            if (output === obj) {
              output = { ...obj };
            }
            output[key] = r.value;
          } else {
            issueTree = joinIssues(prependPath(key, r), issueTree);
          }
        } else if (strip && output !== obj && value !== Nothing) {
          output[key] = value;
        }
      }

      if (issueTree) {
        return issueTree;
      }

      if (checks) {
        for (let i = 0; i < checks.length; i++) {
          if (!checks[i].func(output)) {
            return checks[i].issue;
          }
        }
      }

      if (obj === output) {
        return true;
      } else {
        return { code: "ok", value: output as ObjectOutput<Shape, Rest> };
      }
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
> extends Type<ArrayOutput<Head, Rest>, false> {
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
            issueTree = joinIssues(prependPath(i, r), issueTree);
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
  t: { root: Type; terminal: TerminalType }[]
): {
  key: string;
  optional?: Type;
  matcher: (
    rootValue: unknown,
    value: unknown,
    mode: FuncMode
  ) => Result<unknown>;
}[] {
  const objects: {
    root: Type;
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
    let optional: Type | undefined = undefined;
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
  t: { root: Type; terminal: TerminalType }[],
  path?: Key[]
): (rootValue: unknown, value: unknown, mode: FuncMode) => Result<unknown> {
  const order = new Map<Type, number>();
  t.forEach(({ root }, i) => {
    order.set(root, order.get(root) ?? i);
  });
  const byOrder = (a: Type, b: Type): number => {
    return (order.get(a) ?? 0) - (order.get(b) ?? 0);
  };

  const expectedTypes = [] as BaseType[];
  const literals = new Map<unknown, Type[]>();
  const types = new Map<BaseType, Type[]>();
  let unknowns = [] as Type[];
  let optionals = [] as Type[];
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
        issueTree = joinIssues(r, issueTree);
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
      issueTree = joinIssues(r, issueTree);
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
  t: { root: Type; type: Type }[]
): { root: Type; terminal: TerminalType }[] {
  const result: { root: Type; terminal: TerminalType }[] = [];
  t.forEach(({ root, type }) =>
    toTerminals(type).forEach((terminal) => {
      result.push({ root, terminal });
    })
  );
  return result;
}

class UnionType<T extends Type[] = Type[]> extends Type<
  Infer<T[number]>,
  true extends {
    [K in keyof T]: T extends Type<never, infer I> ? I : never;
  }[number]
    ? true
    : false
> {
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
            return item.optional.func(Nothing, mode) as Result<
              Infer<T[number]>
            >;
          }
          return { code: "missing_key", key: item.key };
        }
        return item.matcher(v, value, mode) as Result<Infer<T[number]>>;
      }
      return base(v, v, mode) as Result<Infer<T[number]>>;
    };
  }
}

class NeverType extends Type<never, false> {
  readonly name = "never";
  genFunc(): Func<never> {
    const issue: Issue = { code: "invalid_type", expected: [] };
    return (v, _mode) => (v === Nothing ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class UnknownType extends Type<unknown, false> {
  readonly name = "unknown";
  genFunc(): Func<unknown> {
    return (_v, _mode) => true;
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class NumberType extends Type<number, false> {
  readonly name = "number";
  genFunc(): Func<number> {
    const issue: Issue = { code: "invalid_type", expected: ["number"] };
    return (v, _mode) => (typeof v === "number" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class StringType extends Type<string, false> {
  readonly name = "string";
  genFunc(): Func<string> {
    const issue: Issue = { code: "invalid_type", expected: ["string"] };
    return (v, _mode) => (typeof v === "string" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class BigIntType extends Type<bigint, false> {
  readonly name = "bigint";
  genFunc(): Func<bigint> {
    const issue: Issue = { code: "invalid_type", expected: ["bigint"] };
    return (v, _mode) => (typeof v === "bigint" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class BooleanType extends Type<boolean, false> {
  readonly name = "boolean";
  genFunc(): Func<boolean> {
    const issue: Issue = { code: "invalid_type", expected: ["boolean"] };
    return (v, _mode) => (typeof v === "boolean" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class UndefinedType extends Type<undefined, false> {
  readonly name = "undefined";
  genFunc(): Func<undefined> {
    const issue: Issue = { code: "invalid_type", expected: ["undefined"] };
    return (v, _mode) => (v === undefined ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class NullType extends Type<null, false> {
  readonly name = "null";
  genFunc(): Func<null> {
    const issue: Issue = { code: "invalid_type", expected: ["null"] };
    return (v, _mode) => (v === null ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class LiteralType<Out extends Literal = Literal> extends Type<Out, false> {
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
class OptionalType<Output = unknown> extends Type<Output | undefined, true> {
  readonly name = "optional";
  constructor(private readonly type: Type<Output>) {
    super();
  }
  genFunc(): Func<Output> {
    const func = this.type.func;
    return (v, mode) => {
      return v === undefined || v === Nothing ? true : func(v, mode);
    };
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
    into.push(undefined_());
    this.type.toTerminals(into);
  }
}
class TransformType<Output> extends Type<Output, false> {
  readonly name = "transform";
  constructor(
    protected readonly transformed: Type,
    protected readonly transform: Func<unknown>
  ) {
    super();
  }
  genFunc(): Func<Output> {
    const chain: Func<unknown>[] = [];

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let next: Type = this;
    while (next instanceof TransformType) {
      chain.push(next.transform);
      next = next.transformed;
    }
    chain.reverse();

    const func = next.func;
    return (v, mode) => {
      let result = func(v, mode);
      if (result !== true && result.code !== "ok") {
        return result;
      }

      let current =
        result === true ? (v === Nothing ? undefined : v) : result.value;
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
      return result as Result<Output>;
    };
  }
  toTerminals(into: TerminalType[]): void {
    this.transformed.toTerminals(into);
  }
}

function never(): NeverType {
  return new NeverType();
}
function unknown(): UnknownType {
  return new UnknownType();
}
function number(): NumberType {
  return new NumberType();
}
function bigint(): BigIntType {
  return new BigIntType();
}
function string(): StringType {
  return new StringType();
}
function boolean(): BooleanType {
  return new BooleanType();
}
function undefined_(): UndefinedType {
  return new UndefinedType();
}
function null_(): NullType {
  return new NullType();
}
function object<T extends Record<string, Type>>(
  obj: T
): ObjectType<T, undefined> {
  return new ObjectType(obj, undefined);
}
function record<T extends Type>(
  valueType: T
): Type<Record<string, Infer<T>>, false> {
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
function literal<T extends Literal>(value: T): LiteralType<T> {
  return new LiteralType(value);
}
function union<T extends Type[]>(...options: T): UnionType<T> {
  return new UnionType(options);
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
  | OptionalType;

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
  ok,
  err,
};

export type { Type };
