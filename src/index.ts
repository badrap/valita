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

type Issue =
  | I<"invalid_type", { expected: BaseType[] }>
  | I<"invalid_literal", { expected: Literal[] }>
  | I<"missing_key", { key: Key }>
  | I<"unrecognized_key", { key: Key }>
  | I<"invalid_union", { tree: IssueTree }>;

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
    issues.push({ ...tree, path: path.concat(tree.path || []) });
  }
}

function collectIssues(tree: IssueTree): Issue[] {
  const issues: Issue[] = [];
  const path: Key[] = [];
  _collectIssues(tree, path, issues);
  return issues;
}

function orList(list: string[]): string {
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

    let message = "invalid value";
    if (issue.code === "invalid_type") {
      message = `expected ${orList(issue.expected)}`;
    } else if (issue.code === "invalid_literal") {
      message = `expected ${orList(issue.expected.map(formatLiteral))}`;
    } else if (issue.code === "missing_key") {
      message = `missing key ${formatLiteral(issue.key)}`;
    } else if (issue.code === "unrecognized_key") {
      message = `unrecognized key ${formatLiteral(issue.key)}`;
    }

    const path = "." + (issue.path || []).join(".");
    return `${issue.code} at ${path} (${message})`;
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

type Infer<T extends Type> = T extends Type<infer I> ? I : never;

type Func<T> = (v: unknown) => Result<T>;

abstract class Type<Out = unknown> {
  abstract readonly name: string;
  abstract genFunc(): (v: unknown) => Result<Out>;
  abstract toTerminals(into: TerminalType[]): void;

  get isOptional(): boolean {
    const isOptional = toTerminals(this).some((t) => t.name === "undefined");
    Object.defineProperty(this, "isOptional", {
      value: isOptional,
      writable: false,
    });
    return isOptional;
  }

  get func(): Func<Out> {
    const f = this.genFunc();
    Object.defineProperty(this, "func", {
      value: f,
      writable: false,
    });
    return f;
  }

  parse(v: unknown): Out {
    const r = this.func(v);
    if (r === true) {
      return v as Out;
    } else if (r.code === "ok") {
      return r.value;
    } else {
      throw new ValitaError(r);
    }
  }

  optional(): OptionalType<Out, undefined> {
    return new OptionalType(this, undefined);
  }

  transform<T>(this: Type, func: (v: Out) => Result<T>): TransformType<T> {
    return new TransformType(this, func as (v: unknown) => Result<T>);
  }
}

type Optionals<T extends Record<string, Type>> = {
  [K in keyof T]: undefined extends Infer<T[K]> ? K : never;
}[keyof T];

type UnknownKeys = "passthrough" | "strict" | "strip" | Type;

type ObjectShape = Record<string, Type>;

type ObjectOutput<
  T extends ObjectShape,
  U extends UnknownKeys
> = PrettyIntersection<
  { [K in Optionals<T>]?: Infer<T[K]> } &
    { [K in Exclude<keyof T, Optionals<T>>]: Infer<T[K]> } &
    (U extends "passthrough" ? { [K: string]: unknown } : unknown) &
    (U extends Type ? { [K: string]: Infer<U> } : unknown)
>;

class ObjectType<
  T extends ObjectShape = ObjectShape,
  U extends UnknownKeys = UnknownKeys
> extends Type<ObjectOutput<T, U>> {
  readonly name = "object";

  constructor(readonly shape: T, private readonly unknownKeys: U) {
    super();
  }

  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }

  genFunc(): Func<ObjectOutput<T, U>> {
    const shape = this.shape;
    const strip = this.unknownKeys === "strip";
    const strict = this.unknownKeys === "strict";
    const passthrough = this.unknownKeys === "passthrough";
    const catchall =
      this.unknownKeys instanceof Type ? this.unknownKeys.func : undefined;

    const keys: string[] = [];
    const funcs: ((v: unknown) => Result<unknown>)[] = [];
    const required: boolean[] = [];
    const knownKeys = Object.create(null);
    const shapeTemplate = {} as Record<string, unknown>;
    for (const key in shape) {
      keys.push(key);
      funcs.push(shape[key].func);
      required.push(!shape[key].isOptional);
      knownKeys[key] = true;
      shapeTemplate[key] = undefined;
    }

    return (obj) => {
      if (!isObject(obj)) {
        return { code: "invalid_type", expected: ["object"] };
      }
      let issueTree: IssueTree | undefined = undefined;
      let output: Record<string, unknown> = obj;
      const template = strict || strip ? shapeTemplate : obj;
      if (!passthrough) {
        for (const key in obj) {
          if (!knownKeys[key]) {
            if (strict) {
              return { code: "unrecognized_key", key };
            } else if (strip) {
              output = { ...template };
              break;
            } else if (catchall) {
              const r = catchall(obj[key]);
              if (r !== true) {
                if (r.code === "ok") {
                  if (output === obj) {
                    output = { ...template };
                  }
                  output[key] = r.value;
                } else {
                  issueTree = joinIssues(prependPath(key, r), issueTree);
                }
              }
            }
          }
        }
      }

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = obj[key];

        if (value === undefined && required[i]) {
          return { code: "missing_key", key };
        } else {
          const r = funcs[i](value);
          if (r !== true) {
            if (r.code === "ok") {
              if (output === obj) {
                output = { ...template };
              }
              output[keys[i]] = r.value;
            } else {
              issueTree = joinIssues(prependPath(key, r), issueTree);
            }
          }
        }
      }

      if (issueTree) {
        return issueTree;
      } else if (obj === output) {
        return true;
      } else {
        return { code: "ok", value: output as ObjectOutput<T, U> };
      }
    };
  }
  passthrough(): ObjectType<T, "passthrough"> {
    return new ObjectType(this.shape, "passthrough");
  }
  strict(): ObjectType<T, "strict"> {
    return new ObjectType(this.shape, "strict");
  }
  strip(): ObjectType<T, "strip"> {
    return new ObjectType(this.shape, "strip");
  }
  catchall<C extends Type>(catchall: C): ObjectType<T, C> {
    return new ObjectType(this.shape, catchall);
  }
}

class ArrayType<T extends Type = Type> extends Type<Infer<T>[]> {
  readonly name = "array";

  constructor(readonly item: T) {
    super();
  }

  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }

  genFunc(): (v: unknown) => Result<Infer<T>[]> {
    const func = this.item.func;
    return (arr) => {
      if (!Array.isArray(arr)) {
        return { code: "invalid_type", expected: ["array"] };
      }
      let issueTree: IssueTree | undefined = undefined;
      let output: Infer<T>[] = arr;
      for (let i = 0; i < arr.length; i++) {
        const r = func(arr[i]);
        if (r !== true) {
          if (r.code === "ok") {
            if (output === arr) {
              output = arr.slice();
            }
            output[i] = r.value as Infer<T>;
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
  matcher: (v: unknown, k: unknown) => Result<unknown>;
  isOptional: boolean;
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
    const types = new Map<BaseType, unknown[]>();
    const literals = new Map<unknown, unknown[]>();
    shapes.forEach((shape) => {
      toTerminals(shape[key]).forEach((terminal) => {
        if (terminal.name === "literal") {
          const options = literals.get(terminal.value) || [];
          options.push(shape);
          literals.set(terminal.value, options);
        } else {
          const options = types.get(terminal.name) || [];
          options.push(shape);
          types.set(terminal.name, options);
        }
      });
    });
    literals.forEach((found, value) => {
      const options = types.get(toBaseType(value));
      if (options) {
        options.push(...found);
        literals.delete(value);
      }
    });
    let success = true;
    literals.forEach((found) => {
      if (dedup(found).length > 1) {
        success = false;
      }
    });
    types.forEach((found) => {
      if (dedup(found).length > 1) {
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
    return {
      key,
      matcher: createUnionMatcher(flattened),
      isOptional: objects.some(
        ({ terminal }) => terminal.shape[key].isOptional
      ),
    };
  });
}

function createUnionMatcher(
  t: { root: Type; terminal: TerminalType }[]
): (v: unknown, k: unknown) => Result<unknown> {
  const literals = new Map<unknown, Type[]>();
  const types = new Map<BaseType, Type[]>();
  const allTypes = new Set<BaseType>();
  t.forEach(({ root, terminal }) => {
    if (terminal.name === "literal") {
      const roots = literals.get(terminal.value) || [];
      roots.push(root);
      literals.set(terminal.value, roots);
      allTypes.add(toBaseType(terminal.value));
    } else {
      const roots = types.get(terminal.name) || [];
      roots.push(root);
      types.set(terminal.name, roots);
      allTypes.add(terminal.name);
    }
  });
  literals.forEach((vxs, value) => {
    const options = types.get(toBaseType(value));
    if (options) {
      options.push(...vxs);
      literals.delete(value);
    }
  });
  types.forEach((roots, type) => types.set(type, dedup(roots)));
  literals.forEach((roots, value) => literals.set(value, dedup(roots)));

  const expectedTypes: BaseType[] = [];
  allTypes.forEach((type) => expectedTypes.push(type));

  const expectedLiterals: Literal[] = [];
  literals.forEach((_, value) => {
    expectedLiterals.push(value as Literal);
  });

  const invalidType: Issue = {
    code: "invalid_type",
    expected: expectedTypes,
  };
  const invalidLiteral: Issue = {
    code: "invalid_literal",
    expected: expectedLiterals,
  };

  return (v: unknown, k: unknown) => {
    const type = toBaseType(k);
    if (!allTypes.has(type)) {
      return invalidType;
    }

    const options = literals.get(k) || types.get(type);
    if (options) {
      let issueTree: IssueTree | undefined;
      for (let i = 0; i < options.length; i++) {
        const r = options[i].func(v);
        if (r === true || r.code === "ok") {
          return r;
        }
        issueTree = joinIssues(r, issueTree);
      }
      if (issueTree) {
        if (options.length > 1) {
          return { code: "invalid_union", tree: issueTree };
        }
        return issueTree;
      }
    }
    return invalidLiteral;
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
    const objects = createObjectMatchers(flattened);
    const base = createUnionMatcher(flattened);
    return (v) => {
      if (objects.length > 0 && isObject(v)) {
        const item = objects[0];
        const value = v[item.key];
        if (value === undefined && !item.isOptional && !(item.key in v)) {
          return { code: "missing_key", key: item.key };
        }
        const r = item.matcher(v, value);
        if (r === true || r.code === "ok") {
          return r as Result<Infer<T[number]>>;
        }
        return prependPath(item.key, r);
      }
      return base(v, v) as Result<Infer<T[number]>>;
    };
  }
}

class NumberType extends Type<number> {
  readonly name = "number";
  genFunc(): Func<number> {
    const issue: Issue = { code: "invalid_type", expected: ["number"] };
    return (v) => (typeof v === "number" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class StringType extends Type<number> {
  readonly name = "string";
  genFunc(): Func<number> {
    const issue: Issue = { code: "invalid_type", expected: ["string"] };
    return (v) => (typeof v === "string" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class BigIntType extends Type<number> {
  readonly name = "bigint";
  genFunc(): Func<number> {
    const issue: Issue = { code: "invalid_type", expected: ["bigint"] };
    return (v) => (typeof v === "bigint" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class BooleanType extends Type<number> {
  readonly name = "boolean";
  genFunc(): Func<number> {
    const issue: Issue = { code: "invalid_type", expected: ["boolean"] };
    return (v) => (typeof v === "boolean" ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class UndefinedType extends Type<undefined> {
  readonly name = "undefined";
  genFunc(): Func<undefined> {
    const issue: Issue = { code: "invalid_type", expected: ["undefined"] };
    return (v) => (v === undefined ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class NullType extends Type<null> {
  readonly name = "null";
  genFunc(): Func<null> {
    const issue: Issue = { code: "invalid_type", expected: ["null"] };
    return (v) => (v === null ? true : issue);
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
    return (v) => (v === value ? true : issue);
  }
  toTerminals(into: TerminalType[]): void {
    into.push(this);
  }
}
class OptionalType<Out, Default> extends Type<Out | Default> {
  readonly name = "optional";
  constructor(
    private readonly type: Type<Out>,
    private readonly defaultValue: Default
  ) {
    super();
  }
  genFunc(): Func<Out | Default> {
    const func = this.type.func;
    const defaultResult =
      this.defaultValue === undefined
        ? true
        : ({ code: "ok", value: this.defaultValue } as const);
    return (v) => (v === undefined ? defaultResult : func(v));
  }
  toTerminals(into: TerminalType[]): void {
    into.push(undefined_());
    this.type.toTerminals(into);
  }
}
class TransformType<Out> extends Type<Out> {
  readonly name = "transform";
  constructor(
    readonly transformed: Type,
    private readonly transformFunc: (v: unknown) => Result<Out>
  ) {
    super();
  }
  genFunc(): Func<Out> {
    const f = this.transformed.func;
    const t = this.transformFunc;
    return (v) => {
      const r = f(v);
      if (r !== true && r.code !== "ok") {
        return r;
      }
      return t(r === true ? v : r.value);
    };
  }
  toTerminals(into: TerminalType[]): void {
    this.transformed.toTerminals(into);
  }
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
): ObjectType<T, "strict"> {
  return new ObjectType(obj, "strict");
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
  number,
  bigint,
  string,
  boolean,
  object,
  array,
  literal,
  union,
  null_ as null,
  undefined_ as undefined,
};

export type { Infer as infer };
