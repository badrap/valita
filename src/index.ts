type IssuePath = (string | number)[];

type Issue = { path: IssuePath; message: string };

function _collectIssues(
  ctx: ErrorContext,
  path: IssuePath,
  issues: Issue[]
): void {
  if (ctx.type === "error") {
    issues.push({
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

function err(message: string): ErrorContext {
  return { ok: false, type: "error", message };
}

type Infer<T extends Vx<unknown>> = T extends Vx<infer I> ? I : never;

class Vx<T> {
  constructor(private readonly _genFunc: () => (v: unknown) => Result<T>) {}

  get func(): (v: unknown) => Result<T> {
    const f = this._genFunc();
    Object.defineProperty(this, "func", {
      value: f,
      writable: false,
    });
    return f;
  }

  transform<O>(func: (v: T) => Result<O>): Vx<O> {
    const f = this.func;
    return new Vx(() => (v) => {
      const r = f(v);
      if (r !== true && !r.ok) {
        return r;
      }
      return func(r === true ? (v as T) : r.value);
    });
  }
  parse(v: unknown): T {
    const r = this.func(v);
    if (r === true) {
      return v as T;
    } else if (r.ok) {
      return r.value;
    } else {
      throw new ValitaError(r);
    }
  }
  optional(): Vx<T | undefined> {
    const f = this.func;
    return new Vx(() => (v) => {
      return v === undefined ? true : f(v);
    });
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

class VxObj<
  T extends Record<string, Vx<unknown>>,
  U extends UnknownKeys
> extends Vx<VxObjOutput<T, U>> {
  constructor(private readonly shape: T, private readonly unknownKeys: U) {
    super(() => {
      const obj = this.shape;

      const keys: string[] = [];
      const vals: ((v: unknown) => Result<unknown>)[] = [];
      for (const k in obj) {
        keys.push(k);
        vals.push(obj[k].func);
      }
      const l = keys.length;
      const q = Object.create(null);
      keys.forEach((k) => {
        q[k] = true;
      });

      const strip = this.unknownKeys === "strip";
      const strict = this.unknownKeys === "strict";
      const passthrough = this.unknownKeys === "passthrough";
      const catchall =
        this.unknownKeys instanceof Vx
          ? (this.unknownKeys.func as (v: unknown) => Result<unknown>)
          : undefined;

      const template = {} as Record<string, unknown>;
      keys.forEach((key) => {
        template[key] = undefined;
      });

      return (v) => {
        if (!isObject(v)) {
          return err("expected an object");
        }
        let ctx: ErrorContext | undefined = undefined;
        let output = v as Record<string, unknown>;
        const tpl = strict || strip ? template : v;
        if (!passthrough) {
          for (const k in v) {
            if (!q[k]) {
              if (strict) {
                return err(`unexpected key ${JSON.stringify(k)}`);
              } else if (strip) {
                output = { ...tpl };
                break;
              } else if (catchall) {
                const r = catchall(v[k]);
                if (r === true) {
                  // pass
                } else if (!r.ok) {
                  ctx = {
                    ok: false,
                    type: "path",
                    value: k,
                    current: r,
                    next: ctx,
                  };
                } else {
                  if (output === v) {
                    output = { ...tpl };
                  }
                  output[k] = r.value;
                }
              }
            }
          }
        }
        for (let i = 0; i < l; i++) {
          const r = vals[i](v[keys[i]]);
          if (r === true) {
            // pass
          } else if (r.ok) {
            if (output === v) {
              output = { ...tpl };
            }
            output[keys[i]] = r.value;
          } else {
            ctx = {
              ok: false,
              type: "path",
              value: keys[i],
              current: r,
              next: ctx,
            };
          }
        }
        if (ctx) {
          return ctx;
        }
        return v === output
          ? true
          : { ok: true, value: output as VxObjOutput<T, U> };
      };
    });
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

function number(): Vx<number> {
  const e = err("expected a number");
  return new Vx(() => (v) => (typeof v === "number" ? true : e));
}
function string(): Vx<string> {
  const e = err("expected a string");
  return new Vx(() => (v) => (typeof v === "string" ? true : e));
}
function boolean(): Vx<boolean> {
  const e = err("expected a boolean");
  return new Vx(() => (v) => (typeof v === "boolean" ? true : e));
}
function undefined_(): Vx<undefined> {
  const e = err("expected undefined");
  return new Vx(() => (v) => (v === undefined ? true : e));
}
function null_(): Vx<null> {
  const e = err("expected null");
  return new Vx(() => (v) => (v === null ? true : e));
}
function object<T extends Record<string, Vx<unknown>>>(
  obj: T
): VxObj<T, "strict"> {
  return new VxObj(obj, "strict");
}

export {
  number,
  string,
  boolean,
  null_ as null,
  undefined_ as undefined,
  object,
};

export type { Infer as infer };
