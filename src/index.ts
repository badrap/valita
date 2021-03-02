type IssueCode =
  | "invalid_type"
  | "invalid_literal_value"
  | "invalid_union"
  | "missing_key"
  | "unrecognized_key";

type IssuePath = (string | number)[];

type Issue = {
  code: IssueCode;
  path: IssuePath;
  message: string;
};

function _collectIssues(
  ctx: ErrorContext,
  path: IssuePath,
  issues: Issue[]
): void {
  if (ctx.type === "error") {
    issues.push({
      code: ctx.code,
      path: path.slice(),
      message: ctx.message,
    });
  } else {
    if (ctx.next) {
      _collectIssues(ctx.next, path, issues);
    }
    path.push(ctx.value);
    _collectIssues(ctx.current, path, issues);
    path.pop();
  }
}

function collectIssues(ctx: ErrorContext): Issue[] {
  const issues: Issue[] = [];
  const path: IssuePath = [];
  _collectIssues(ctx, path, issues);
  return issues;
}

export class ValitaError extends Error {
  constructor(private readonly ctx: ErrorContext) {
    super();
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }

  get issues(): readonly Issue[] {
    const issues = collectIssues(this.ctx);
    Object.defineProperty(this, "issues", {
      value: issues,
      writable: false,
    });
    return issues;
  }

  get message(): string {
    const issue = this.issues[0];
    const path = "." + issue.path.join(".");
    return `${issue.code} at ${path} (${issue.message})`;
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type PrettifyObjectType<V> = Extract<{ [K in keyof V]: V[K] }, unknown>;

type ErrorContext = Readonly<
  | {
      ok: false;
      type: "path";
      value: string | number;
      current: ErrorContext;
      next?: ErrorContext;
    }
  | {
      ok: false;
      type: "error";
      code: IssueCode;
      message: string;
    }
>;
type Ok<T> =
  | true
  | Readonly<{
      ok: true;
      value: T;
    }>;
type Result<T> = Ok<T> | ErrorContext;

function err(code: IssueCode, message: string): ErrorContext {
  return { ok: false, type: "error", code, message };
}

function appendErr(
  to: ErrorContext | undefined,
  key: string | number,
  err: ErrorContext
): ErrorContext {
  return {
    ok: false,
    type: "path",
    value: key,
    current: err,
    next: to,
  };
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

class Vx<Out, In extends Type = Type> {
  constructor(
    private readonly genFunc: () => (v: unknown) => Result<Out>,
    readonly isOptional: boolean,
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
        if (r !== true && !r.ok) {
          return r;
        }
        return func(r === true ? (v as Out) : r.value);
      },
      this.isOptional,
      this.type
    );
  }

  parse(v: unknown): Out {
    const r = this.func(v);
    if (r === true) {
      return v as Out;
    } else if (r.ok) {
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
      true,
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
> = PrettifyObjectType<
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
          required.push(!shape[key].isOptional);
          knownKeys[key] = true;
          shapeTemplate[key] = undefined;
        }

        return (obj) => {
          if (!isObject(obj)) {
            return err("invalid_type", "expected an object");
          }
          let ctx: ErrorContext | undefined = undefined;
          let output: Record<string, unknown> = obj;
          const template = strict || strip ? shapeTemplate : obj;
          if (!passthrough) {
            for (const key in obj) {
              if (!knownKeys[key]) {
                if (strict) {
                  return err(
                    "unrecognized_key",
                    `unrecognized key ${JSON.stringify(key)}`
                  );
                } else if (strip) {
                  output = { ...template };
                  break;
                } else if (catchall) {
                  const r = catchall(obj[key]);
                  if (r !== true) {
                    if (r.ok) {
                      if (output === obj) {
                        output = { ...template };
                      }
                      output[key] = r.value;
                    } else {
                      ctx = appendErr(ctx, key, r);
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
              ctx = appendErr(ctx, key, err("missing_key", `missing key`));
            } else {
              const r = funcs[i](value);
              if (r !== true) {
                if (r.ok) {
                  if (output === obj) {
                    output = { ...template };
                  }
                  output[keys[i]] = r.value;
                } else {
                  ctx = appendErr(ctx, key, r);
                }
              }
            }
          }

          if (ctx) {
            return ctx;
          } else if (obj === output) {
            return true;
          } else {
            return { ok: true, value: output as VxObjOutput<T, U> };
          }
        };
      },
      false,
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
            return err("invalid_type", "expected an array");
          }
          let ctx: ErrorContext | undefined = undefined;
          let output: Infer<T>[] = arr;
          for (let i = 0; i < arr.length; i++) {
            const r = func(arr[i]);
            if (r !== true) {
              if (r.ok) {
                if (output === arr) {
                  output = arr.slice();
                }
                output[i] = r.value as Infer<T>;
              } else {
                ctx = appendErr(ctx, i, r);
              }
            }
          }
          if (ctx) {
            return ctx;
          } else if (arr === output) {
            return true;
          } else {
            return { ok: true, value: output };
          }
        };
      },
      false,
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
    const flattened = flatten(
      objects.map(({ vx, type }) => ({ vx, type: type.shape[key] }))
    );
    return {
      key,
      matcher: createUnionMatcher(flattened),
      isOptional: flattened.some((x) => x.type.type === "undefined"),
    };
  });
}

function createUnionMatcher(
  t: { vx: Vx<unknown>; type: Type }[]
): (v: unknown, k: unknown) => Result<unknown> {
  const literals = new Map<unknown, Vx<unknown>[]>();
  const types = new Map<string, Vx<unknown>[]>();
  t.forEach(({ vx, type }) => {
    if (type.type === "literal") {
      const options = literals.get(type.value) || [];
      options.push(vx);
      literals.set(type.value, options);
    } else {
      const options = types.get(type.type) || [];
      options.push(vx);
      types.set(type.type, options);
    }
  });
  literals.forEach((vxs, value) => {
    const options = types.get(toType(value));
    if (options) {
      options.push(...vxs);
      literals.delete(value);
    }
  });
  types.forEach((vxs, type) => {
    types.set(type, dedup(vxs));
  });
  literals.forEach((vxs, value) => {
    literals.set(value, dedup(vxs));
  });

  const expected = [] as string[];
  types.forEach((_, type) => {
    expected.push(type);
  });
  literals.forEach((_, value) => {
    expected.push(JSON.stringify(value));
  });
  const last = expected.pop();
  const e = err(
    "invalid_union",
    `expected ${expected.join(", ")}${expected.length > 0 ? " or " : ""}${last}`
  );

  return (v: unknown, k: unknown) => {
    const options = literals.get(k) || types.get(toType(k));
    if (options) {
      let lastError: ErrorContext | undefined;
      for (let i = 0; i < options.length; i++) {
        const r = options[i].func(v);
        if (r === true || r.ok) {
          return r;
        }
        lastError = r;
      }
      if (options.length > 1) {
        return err("invalid_union", `invalid ${toType(k)}`);
      } else if (lastError) {
        return lastError;
      }
    }
    return e;
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
              return appendErr(
                undefined,
                item.key,
                err("missing_key", "missing key")
              );
            }
            const r = item.matcher(v, value);
            if (r === true || r.ok) {
              return r as Result<Infer<T[number]>>;
            }
            return appendErr(undefined, item.key, r);
          }
          return base(v, v) as Result<Infer<T[number]>>;
        };
      },
      args.some((arg) => arg.isOptional),
      {
        type: "union",
        children: args.map((arg) => arg.type),
      }
    );
  }
}

function number(): Vx<number> {
  const e = err("invalid_type", "expected a number");
  return new Vx(() => (v) => (typeof v === "number" ? true : e), false, {
    type: "number",
  });
}
function bigint(): Vx<bigint> {
  const e = err("invalid_type", "expected a bigint");
  return new Vx(() => (v) => (typeof v === "bigint" ? true : e), false, {
    type: "bigint",
  });
}
function string(): Vx<string> {
  const e = err("invalid_type", "expected a string");
  return new Vx(() => (v) => (typeof v === "string" ? true : e), false, {
    type: "string",
  });
}
function boolean(): Vx<boolean> {
  const e = err("invalid_type", "expected a boolean");
  return new Vx(() => (v) => (typeof v === "boolean" ? true : e), false, {
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
  const exp = typeof value === "bigint" ? `${value}n` : JSON.stringify(value);
  const e = err("invalid_literal_value", `expected ${exp}`);
  return new Vx(() => (v) => (v === value ? true : e), false, {
    type: "literal",
    value,
  });
}
function undefined_(): Vx<undefined, { type: "undefined"; value: undefined }> {
  const e = err("invalid_type", "expected undefined");
  return new Vx(() => (v) => (v === undefined ? true : e), true, {
    type: "undefined",
  });
}
function null_(): Vx<null, { type: "null"; value: null }> {
  const e = err("invalid_type", "expected null");
  return new Vx(() => (v) => (v === null ? true : e), false, {
    type: "null",
  });
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
