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

type Infer<T extends Vx<unknown>> = T extends Vx<infer I> ? I : never;

type Type =
  | {
      type: "literal";
      value: string | number | bigint | boolean;
    }
  | {
      type: "object";
      shape: Record<string, Type>;
    }
  | {
      type: "array";
      item: Type;
    }
  | {
      type: "string" | "number" | "bigint" | "boolean" | "undefined" | "null";
    }
  | {
      type: "union";
      children: Type[];
    };

function isOptional(type: Type): boolean {
  if (type.type === "union") {
    return type.children.some(isOptional);
  } else {
    return type.type === "undefined";
  }
}

class Vx<Out, In extends Type = Type> {
  constructor(
    private readonly genFunc: () => (v: unknown) => Result<Out>,
    readonly type: Type
  ) {}

  get func(): (v: unknown) => Result<Out> {
    const f = this.genFunc();
    Object.defineProperty(this, "func", {
      value: f,
      writable: false,
    });
    return f;
  }

  transform<O>(func: (v: Out) => Result<O>): Vx<O, In> {
    const f = this.func;
    return new Vx(
      () => (v) => {
        const r = f(v);
        if (r !== true && r.code !== "ok") {
          return r;
        }
        return func(r === true ? (v as Out) : r.value);
      },
      this.type
    );
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

  optional(): Vx<
    Out | undefined,
    {
      type: "union";
      children: [In, { type: "undefined" }];
    }
  > {
    const f = this.func;
    return new Vx(
      () => (v) => {
        return v === undefined ? true : f(v);
      },
      {
        type: "union",
        children: [this.type, { type: "undefined" }],
      }
    );
  }
}

type Optionals<T extends Record<string, Vx<unknown>>> = {
  [K in keyof T]: undefined extends Infer<T[K]> ? K : never;
}[keyof T];

type UnknownKeys = "passthrough" | "strict" | "strip" | Vx<unknown>;

type VxObjOutput<
  T extends Record<string, Vx<unknown>>,
  U extends UnknownKeys
> = PrettyIntersection<
  { [K in Optionals<T>]?: Infer<T[K]> } &
    { [K in Exclude<keyof T, Optionals<T>>]: Infer<T[K]> } &
    (U extends "passthrough" ? { [K: string]: unknown } : unknown) &
    (U extends Vx<infer C> ? { [K: string]: C } : unknown)
>;

function collectShape<T extends Record<string, Vx<unknown>>>(
  shape: T
): Record<string, Type> {
  const output = Object.create(null);
  for (const key in shape) {
    output[key] = shape[key].type;
  }
  return output;
}

class VxObj<
  T extends Record<string, Vx<unknown>>,
  U extends UnknownKeys
> extends Vx<
  VxObjOutput<T, U>,
  {
    type: "object";
    shape: {
      [K in keyof T]: T[K]["type"];
    };
  }
> {
  constructor(private readonly shape: T, private readonly unknownKeys: U) {
    super(
      () => {
        const shape = this.shape;
        const strip = this.unknownKeys === "strip";
        const strict = this.unknownKeys === "strict";
        const passthrough = this.unknownKeys === "passthrough";
        const catchall =
          this.unknownKeys instanceof Vx
            ? (this.unknownKeys.func as (v: unknown) => Result<unknown>)
            : undefined;

        const keys: string[] = [];
        const funcs: ((v: unknown) => Result<unknown>)[] = [];
        const required: boolean[] = [];
        const knownKeys = Object.create(null);
        const shapeTemplate = {} as Record<string, unknown>;
        for (const key in shape) {
          keys.push(key);
          funcs.push(shape[key].func);
          required.push(!isOptional(shape[key].type));
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
            return { code: "ok", value: output as VxObjOutput<T, U> };
          }
        };
      },
      {
        type: "object",
        shape: collectShape(shape),
      }
    );
  }
  passthrough(): VxObj<T, "passthrough"> {
    return new VxObj(this.shape, "passthrough");
  }
  strict(): VxObj<T, "strict"> {
    return new VxObj(this.shape, "strict");
  }
  strip(): VxObj<T, "strip"> {
    return new VxObj(this.shape, "strip");
  }
  catchall<C extends Vx<unknown>>(catchall: C): VxObj<T, C> {
    return new VxObj(this.shape, catchall);
  }
}

class VxArr<T extends Vx<unknown>> extends Vx<
  Infer<T>[],
  {
    type: "array";
    item: T["type"];
  }
> {
  constructor(private readonly item: T) {
    super(
      () => {
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
      },
      {
        type: "array",
        item: item.type,
      }
    );
  }
}

function toType(v: unknown): string {
  const type = typeof v;
  if (type !== "object") {
    return type;
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

function findCommonKeys(rs: Record<string, unknown>[]): string[] {
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
  t: { vx: Vx<unknown>; type: Type }[]
): {
  key: string;
  matcher: (v: unknown, k: unknown) => Result<unknown>;
  isOptional: boolean;
}[] {
  const objects: { vx: Vx<unknown>; type: Type & { type: "object" } }[] = [];
  t.forEach(({ vx, type }) => {
    if (type.type === "object") {
      objects.push({ vx, type });
    }
  });
  const shapes = objects.map(({ type }) => type.shape);
  const common = findCommonKeys(shapes);
  const discriminants = common.filter((key) => {
    const types = new Map<unknown, unknown[]>();
    const literals = new Map<unknown, unknown[]>();
    shapes.forEach((shape) => {
      flattenType(shape[key]).forEach((type) => {
        if (type.type === "literal") {
          const options = literals.get(type.value) || [];
          options.push(shape);
          literals.set(type.value, options);
        } else {
          const options = types.get(type.type) || [];
          options.push(shape);
          types.set(type.type, options);
        }
      });
    });
    literals.forEach((found, value) => {
      const options = types.get(toType(value));
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
    return {
      key,
      matcher: createUnionMatcher(
        flatten(objects.map(({ vx, type }) => ({ vx, type: type.shape[key] })))
      ),
      isOptional: objects.some(({ type }) => isOptional(type)),
    };
  });
}

function createUnionMatcher(
  t: { vx: Vx<unknown>; type: Type }[]
): (v: unknown, k: unknown) => Result<unknown> {
  const literals = new Map<unknown, Vx<unknown>[]>();
  const types = new Map<string, Vx<unknown>[]>();
  const allTypes = new Set<string>();
  t.forEach(({ vx, type }) => {
    if (type.type === "literal") {
      const options = literals.get(type.value) || [];
      options.push(vx);
      literals.set(type.value, options);
      allTypes.add(toType(type.value));
    } else {
      const options = types.get(type.type) || [];
      options.push(vx);
      types.set(type.type, options);
      allTypes.add(type.type);
    }
  });
  literals.forEach((vxs, value) => {
    const options = types.get(toType(value));
    if (options) {
      options.push(...vxs);
      literals.delete(value);
    }
  });
  types.forEach((vxs, type) => types.set(type, dedup(vxs)));
  literals.forEach((vxs, value) => literals.set(value, dedup(vxs)));

  const expectedTypes: BaseType[] = [];
  allTypes.forEach((type) => expectedTypes.push(type as BaseType));

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
    const type = toType(k);
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

function flattenType(type: Type): Type[] {
  const result = [] as Type[];
  function _flatten(type: Type): void {
    if (type.type === "union") {
      type.children.forEach((child) => _flatten(child));
    } else {
      result.push(type);
    }
  }
  _flatten(type);
  return result;
}

function flatten(
  t: { vx: Vx<unknown>; type: Type }[]
): { vx: Vx<unknown>; type: Type }[] {
  const result = [] as { vx: Vx<unknown>; type: Type }[];
  t.forEach(({ vx, type }) =>
    flattenType(type).forEach((type) => {
      result.push({ vx, type });
    })
  );
  return result;
}

class VxUnion<T extends Vx<unknown>[]> extends Vx<
  Infer<T[number]>,
  {
    type: "union";
    children: Type[];
  }
> {
  constructor(private readonly args: T) {
    super(
      () => {
        const flattened = flatten(args.map((vx) => ({ vx, type: vx.type })));
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
      },
      {
        type: "union",
        children: args.map((arg) => arg.type),
      }
    );
  }
}

function number(): Vx<number> {
  const e: Issue = { code: "invalid_type", expected: ["number"] };
  return new Vx(() => (v) => (typeof v === "number" ? true : e), {
    type: "number",
  });
}
function bigint(): Vx<bigint> {
  const e: Issue = { code: "invalid_type", expected: ["bigint"] };
  return new Vx(() => (v) => (typeof v === "bigint" ? true : e), {
    type: "bigint",
  });
}
function string(): Vx<string> {
  const e: Issue = { code: "invalid_type", expected: ["string"] };
  return new Vx(() => (v) => (typeof v === "string" ? true : e), {
    type: "string",
  });
}
function boolean(): Vx<boolean> {
  const e: Issue = { code: "invalid_type", expected: ["boolean"] };
  return new Vx(() => (v) => (typeof v === "boolean" ? true : e), {
    type: "boolean",
  });
}
function object<T extends Record<string, Vx<unknown>>>(
  obj: T
): VxObj<T, "strict"> {
  return new VxObj(obj, "strict");
}
function array<T extends Vx<unknown>>(item: T): VxArr<T> {
  return new VxArr(item);
}
function literal<T extends string | number | boolean | bigint>(
  value: T
): Vx<T, { type: "literal"; value: T }> {
  const e: Issue = { code: "invalid_literal", expected: [value] };
  return new Vx(() => (v) => (v === value ? true : e), {
    type: "literal",
    value,
  });
}
function undefined_(): Vx<undefined, { type: "undefined" }> {
  const e: Issue = { code: "invalid_type", expected: ["undefined"] };
  return new Vx(() => (v) => (v === undefined ? true : e), {
    type: "undefined",
  });
}
function null_(): Vx<null, { type: "null" }> {
  const e: Issue = { code: "invalid_type", expected: ["null"] };
  return new Vx(() => (v) => (v === null ? true : e), { type: "null" });
}
function union<T extends Vx<unknown>[]>(...args: T): VxUnion<T> {
  return new VxUnion(args);
}

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
