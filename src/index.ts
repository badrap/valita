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

export class ValitaError extends Error {
  constructor(private readonly issueTree: IssueTree) {
    super();
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

  get message(): string {
    const issue = this.issues[0];
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
    } else if (issue.code === "custom_error") {
      const error = issue.error;
      if (typeof error === "string") {
        message = error;
      } else if (error && error.message === "string") {
        message = error.message;
      }
    }

    return `${issue.code} at .${path.join(".")} (${message})`;
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

declare namespace Type {
  type InputFlags =
    | "accepts_something"
    | "accepts_undefined"
    | "accepts_nothing";
  type OutputFlags = "outputs_something" | "outputs_nothing";
  type InputFlagsOf<T> = T extends Type<unknown, unknown, infer I, OutputFlags>
    ? I
    : never;
  type OutputFlagsOf<T> = T extends Type<unknown, unknown, InputFlags, infer I>
    ? I
    : never;
  type SomethingOutputOf<T extends Type> = T extends Type<infer I, unknown>
    ? I
    : never;
  type NothingOutputOf<T extends Type> = T extends Type<unknown, infer I>
    ? I
    : never;
}

type DefaultOutput<T extends Type, DefaultValue> = Type<
  undefined extends
    | Type.SomethingOutputOf<T>
    | ("accepts_undefined" extends Type.InputFlagsOf<T> ? never : undefined)
    ? DefaultValue | Exclude<Type.SomethingOutputOf<T>, undefined>
    : Type.SomethingOutputOf<T>,
  undefined extends
    | Type.NothingOutputOf<T>
    | ("accepts_nothing" extends Type.InputFlagsOf<T> ? never : undefined)
    | ("outputs_nothing" extends Type.OutputFlagsOf<T> ? undefined : never)
    ? DefaultValue | Exclude<Type.NothingOutputOf<T>, undefined>
    : Type.NothingOutputOf<T>,
  | "accepts_nothing"
  | "accepts_undefined"
  | "accepts_something"
  | Type.InputFlagsOf<T>,
  Exclude<Type.OutputFlagsOf<T>, "outputs_nothing"> | "outputs_something"
>;

abstract class Type<
  SomethingOutput = unknown,
  NothingOutput = unknown,
  InputFlags extends Type.InputFlags = Type.InputFlags,
  OutputFlags extends Type.OutputFlags = Type.OutputFlags
> {
  protected declare _types: {
    somethingOutput: SomethingOutput;
    nothingOutput: NothingOutput;
    inputFlags: InputFlags;
    outputFlags: OutputFlags;
  };

  abstract readonly name: string;
  abstract genFunc(): Func<SomethingOutput | NothingOutput>;
  abstract toTerminals(into: TerminalType[]): void;

  get func(): Func<SomethingOutput | NothingOutput> {
    const f = this.genFunc();
    Object.defineProperty(this, "func", {
      value: f,
      writable: false,
    });
    return f;
  }

  parse(
    v: unknown,
    options?: Partial<ParseOptions>
  ): SomethingOutput | NothingOutput {
    let mode: FuncMode = FuncMode.PASS;
    if (options && options.mode === "strict") {
      mode = FuncMode.STRICT;
    } else if (options && options.mode === "strip") {
      mode = FuncMode.STRIP;
    }

    const r = this.func(v, mode);
    if (r === true) {
      return v as SomethingOutput | NothingOutput;
    } else if (r.code === "ok") {
      return r.value as SomethingOutput | NothingOutput;
    } else {
      throw new ValitaError(r);
    }
  }

  optional<This extends this>(this: This): OptionalType<This> {
    return new OptionalType(this);
  }

  default<T extends Literal, This extends this>(
    this: This,
    defaultValue: T
  ): DefaultOutput<This, T>;
  default<T, This extends this>(
    this: This,
    defaultValue: T
  ): DefaultOutput<This, T>;
  default<T, This extends this>(
    this: This,
    defaultValue: T
  ): DefaultOutput<This, T> {
    return (this.optional().map((v) =>
      v === undefined ? defaultValue : v
    ) as unknown) as DefaultOutput<This, T>;
  }

  assert<T extends SomethingOutput | NothingOutput, This extends this = this>(
    this: This,
    func: (v: SomethingOutput | NothingOutput) => v is T,
    error?: CustomError
  ): TransformType<This, T, OutputFlags>;
  assert<T extends SomethingOutput | NothingOutput, This extends this = this>(
    this: This,
    func: (v: SomethingOutput | NothingOutput) => boolean,
    error?: CustomError
  ): TransformType<This, T, OutputFlags>;
  assert<T extends SomethingOutput | NothingOutput, This extends this = this>(
    this: This,
    func: (v: SomethingOutput | NothingOutput) => boolean,
    error?: CustomError
  ): TransformType<This, T, OutputFlags> {
    const err = { code: "custom_error", error } as const;
    return new TransformType(this, (v) =>
      func(v as SomethingOutput | NothingOutput) ? true : err
    );
  }

  map<T, This extends this>(
    this: This,
    func: (v: SomethingOutput | NothingOutput) => T
  ): TransformType<
    This,
    T,
    Exclude<OutputFlags, "outputs_nothing"> | "outputs_something"
  > {
    return new TransformType(this, (v) => ({
      code: "ok",
      value: func(v as SomethingOutput | NothingOutput),
    }));
  }

  chain<T, This extends this>(
    this: This,
    func: (v: SomethingOutput | NothingOutput) => ChainResult<T>
  ): TransformType<
    This,
    T,
    Exclude<OutputFlags, "outputs_nothing"> | "outputs_something"
  > {
    return new TransformType(this, (v) => {
      const r = func(v as SomethingOutput | NothingOutput);
      if (r.ok) {
        return { code: "ok", value: r.value };
      } else {
        return { code: "custom_error", error: r.error };
      }
    });
  }
}

type Optionals<T extends Record<string, Type>> = {
  [K in keyof T]:
    | "outputs_nothing"
    | "outputs_something" extends Type.OutputFlagsOf<T[K]>
    ? K
    : never;
}[keyof T];

type ObjectShape = Record<string, Type>;

type ObjectOutput<
  T extends ObjectShape,
  R extends Type | undefined
> = PrettyIntersection<
  {
    [K in Optionals<T>]?:
      | Type.SomethingOutputOf<T[K]>
      | Type.NothingOutputOf<T[K]>;
  } &
    {
      [K in Exclude<keyof T, Optionals<T>>]:
        | Type.SomethingOutputOf<T[K]>
        | Type.NothingOutputOf<T[K]>;
    } &
    (R extends Type ? { [K: string]: Type.SomethingOutputOf<R> } : unknown)
>;

class ObjectType<
  T extends ObjectShape = ObjectShape,
  Rest extends Type | undefined = Type | undefined
> extends Type<
  ObjectOutput<T, Rest>,
  never,
  "accepts_something",
  "outputs_something"
> {
  readonly name = "object";

  constructor(readonly shape: T, private readonly restType: Rest) {
    super();
  }

  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }

  genFunc(): Func<ObjectOutput<T, Rest>> {
    const shape = this.shape;
    const rest = this.restType ? this.restType.func : undefined;
    const invalidType: Issue = { code: "invalid_type", expected: ["object"] };

    const keys: string[] = [];
    const funcs: Func<unknown>[] = [];
    const required: boolean[] = [];
    const knownKeys = Object.create(null);
    const shapeTemplate = {} as Record<string, unknown>;
    for (const key in shape) {
      keys.push(key);
      funcs.push(shape[key].func);
      knownKeys[key] = true;

      const isRequired = !hasTerminal(shape[key], "nothing");
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
      } else if (obj === output) {
        return true;
      } else {
        return { code: "ok", value: output as ObjectOutput<T, Rest> };
      }
    };
  }
  rest<R extends Type>(restType: R): ObjectType<T, R> {
    return new ObjectType(this.shape, restType);
  }
}

class ArrayType<T extends Type = Type> extends Type<
  Type.SomethingOutputOf<T>[],
  never,
  "accepts_something",
  "outputs_something"
> {
  readonly name = "array";

  constructor(readonly item: T) {
    super();
  }

  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }

  genFunc(): Func<Type.SomethingOutputOf<T>[]> {
    const func = this.item.func;
    return (arr, mode) => {
      if (!Array.isArray(arr)) {
        return { code: "invalid_type", expected: ["array"] };
      }
      let issueTree: IssueTree | undefined = undefined;
      let output: Type.SomethingOutputOf<T>[] = arr;
      for (let i = 0; i < arr.length; i++) {
        const r = func(arr[i], mode);
        if (r !== true) {
          if (r.code === "ok") {
            if (output === arr) {
              output = arr.slice();
            }
            output[i] = r.value as Type.SomethingOutputOf<T>;
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
        return { code: "ok", value: output };
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
  nothing?: Type;
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
    let nothings = [] as number[];
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
        } else if (terminal.name === "nothing") {
          nothings.push(i);
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
    nothings = dedup(nothings);
    if (nothings.length > 1) {
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
    let nothing: Type | undefined = undefined;
    for (let i = 0; i < flattened.length; i++) {
      const { root, terminal } = flattened[i];
      if (terminal.name === "nothing") {
        nothing = root;
        break;
      }
    }
    return {
      key,
      nothing,
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
  let nothings = [] as Type[];
  t.forEach(({ root, terminal }) => {
    if (terminal.name === "never") {
      // skip
    } else if (terminal.name === "nothing") {
      nothings.push(root);
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
  nothings = dedup(nothings).sort(byOrder);
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
      for (let i = 0; i < nothings.length; i++) {
        const r = nothings[i].func(rootValue, mode);
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
  Type.SomethingOutputOf<T[number]>,
  Type.NothingOutputOf<T[number]>,
  Type.InputFlagsOf<T[number]>,
  Type.OutputFlagsOf<T[number]>
> {
  readonly name = "union";

  constructor(readonly options: T) {
    super();
  }

  toTerminals(into: TerminalType[]): void {
    this.options.forEach((o) => o.toTerminals(into));
  }

  genFunc(): Func<Type.SomethingOutputOf<T[number]>> {
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
          if (item.nothing) {
            return item.nothing.func(Nothing, mode) as Result<
              Type.SomethingOutputOf<T[number]>
            >;
          }
          return { code: "missing_key", key: item.key };
        }
        return item.matcher(v, value, mode) as Result<
          Type.SomethingOutputOf<T[number]>
        >;
      }
      return base(v, v, mode) as Result<Type.SomethingOutputOf<T[number]>>;
    };
  }
}

class NeverType extends Type<never, never, never, never> {
  readonly name = "never";
  genFunc(): Func<never> {
    const issue: Issue = { code: "invalid_type", expected: [] };
    return (v, _mode) => (v === Nothing ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class NothingType extends Type<
  never,
  never,
  "accepts_nothing",
  "outputs_nothing"
> {
  readonly name = "nothing";
  genFunc(): Func<never> {
    const issue: Issue = { code: "invalid_type", expected: [] };
    return (v, _mode) => (v === Nothing ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class UnknownType extends Type<
  unknown,
  never,
  "accepts_undefined" | "accepts_something",
  "outputs_something"
> {
  readonly name = "unknown";
  genFunc(): Func<unknown> {
    return (_v, _mode) => true;
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class NumberType extends Type<
  number,
  never,
  "accepts_something",
  "outputs_something"
> {
  readonly name = "number";
  genFunc(): Func<number> {
    const issue: Issue = { code: "invalid_type", expected: ["number"] };
    return (v, _mode) => (typeof v === "number" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class StringType extends Type<
  string,
  never,
  "accepts_something",
  "outputs_something"
> {
  readonly name = "string";
  genFunc(): Func<string> {
    const issue: Issue = { code: "invalid_type", expected: ["string"] };
    return (v, _mode) => (typeof v === "string" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class BigIntType extends Type<
  bigint,
  never,
  "accepts_something",
  "outputs_something"
> {
  readonly name = "bigint";
  genFunc(): Func<bigint> {
    const issue: Issue = { code: "invalid_type", expected: ["bigint"] };
    return (v, _mode) => (typeof v === "bigint" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class BooleanType extends Type<
  boolean,
  never,
  "accepts_something",
  "outputs_something"
> {
  readonly name = "boolean";
  genFunc(): Func<boolean> {
    const issue: Issue = { code: "invalid_type", expected: ["boolean"] };
    return (v, _mode) => (typeof v === "boolean" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class UndefinedType extends Type<
  undefined,
  never,
  "accepts_undefined" | "accepts_something",
  "outputs_something"
> {
  readonly name = "undefined";
  genFunc(): Func<undefined> {
    const issue: Issue = { code: "invalid_type", expected: ["undefined"] };
    return (v, _mode) => (v === undefined ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class NullType extends Type<
  null,
  never,
  "accepts_something",
  "outputs_something"
> {
  readonly name = "null";
  genFunc(): Func<null> {
    const issue: Issue = { code: "invalid_type", expected: ["null"] };
    return (v, _mode) => (v === null ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class LiteralType<Out extends Literal = Literal> extends Type<
  Out,
  never,
  "accepts_something",
  "outputs_something"
> {
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

class OptionalType<T extends Type> extends Type<
  | Type.SomethingOutputOf<T>
  | ("accepts_undefined" extends Type.InputFlagsOf<T> ? never : undefined),
  | Type.NothingOutputOf<T>
  | ("accepts_nothing" extends Type.InputFlagsOf<T> ? never : undefined),
  | "accepts_something"
  | "accepts_undefined"
  | "accepts_nothing"
  | Type.InputFlagsOf<T>,
  | ("accepts_nothing" extends Type.InputFlagsOf<T>
      ? Type.OutputFlagsOf<T>
      : "outputs_nothing")
  | ("accepts_undefined" extends Type.InputFlagsOf<T>
      ? Type.OutputFlagsOf<T>
      : "outputs_something")
> {
  readonly name = "optional";
  constructor(private readonly type: T) {
    super();
  }
  genFunc(): Func<
    | Type.SomethingOutputOf<T>
    | ("accepts_undefined" extends Type.InputFlagsOf<T> ? never : undefined)
  > {
    const func = this.type.func;
    const hasNothing = hasTerminal(this.type, "nothing");
    const hasUndefined = hasTerminal(this.type, "undefined");
    return (v, mode) => {
      if (v === Nothing && !hasNothing) {
        return true;
      } else if (v === undefined && !hasUndefined) {
        return true;
      } else {
        return func(v, mode) as Result<Type.SomethingOutputOf<T>>;
      }
    };
  }
  toTerminals(into: TerminalType[]): void {
    into.push(nothing());
    into.push(undefined_());
    this.type.toTerminals(into);
  }
}

class TransformType<
  T extends Type,
  Out,
  OutputFlags extends Type.OutputFlags,
  X = "accepts_something" extends Type.InputFlagsOf<T> ? Out : never,
  Y = "accepts_nothing" extends Type.InputFlagsOf<T> ? Out : never
> extends Type<X, Y, Type.InputFlagsOf<T>, OutputFlags> {
  readonly name = "transform";
  constructor(
    protected readonly transformed: Type,
    protected readonly transform: Func<unknown>
  ) {
    super();
  }

  genFunc(): Func<X | Y> {
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
      return result as Result<X | Y>;
    };
  }
  toTerminals(into: TerminalType[]): void {
    this.transformed.toTerminals(into);
  }
}

function never(): NeverType {
  return new NeverType();
}
function nothing(): NothingType {
  return new NothingType();
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
): Type<
  Record<string, Type.SomethingOutputOf<T>>,
  never,
  "accepts_something",
  "outputs_something"
> {
  return new ObjectType({} as Record<string, never>, valueType);
}
function array<T extends Type>(item: T): ArrayType<T> {
  return new ArrayType(item);
}
function literal<T extends Literal>(value: T): LiteralType<T> {
  return new LiteralType(value);
}
function union<T extends Type[]>(...options: T): UnionType<T> {
  return new UnionType(options);
}

type TerminalType =
  | NeverType
  | NothingType
  | UnknownType
  | StringType
  | NumberType
  | BigIntType
  | BooleanType
  | UndefinedType
  | NullType
  | ObjectType
  | ArrayType
  | LiteralType;

export {
  never,
  nothing,
  unknown,
  number,
  bigint,
  string,
  boolean,
  object,
  record,
  array,
  literal,
  union,
  null_ as null,
  undefined_ as undefined,
  ok,
  err,
};

type Infer<T extends Type> = Type.SomethingOutputOf<T>;
export type { Infer, Type };
