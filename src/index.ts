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

class VxObj<
  T extends Record<string, Vx<unknown>>,
  Mode extends "passthrough" | "strict" | "strip" | "catchall",
  Catchall extends Mode extends "catchall" ? unknown : undefined,
  O = PrettifyObjectType<
    { [K in Optionals<T>]?: Infer<T[K]> } &
      { [K in Exclude<keyof T, Optionals<T>>]: Infer<T[K]> } &
      (Mode extends "passthrough" ? { [K: string]: unknown } : unknown) &
      (Mode extends "catchall" ? { [K: string]: Catchall } : unknown)
  >
> extends Vx<O> {
  private readonly _shape: T;
  private readonly _mode: Mode;
  private readonly _catchall?: Vx<Catchall>;

  constructor(shape: T, mode: Mode, catchall?: Vx<Catchall>) {
    super(() => {
      const obj = this._shape;

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

      const catchall = this._catchall?.func;
      const strict = this._mode === "strict";
      const strip = this._mode === "strip";
      const passthrough = this._mode === "passthrough";

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
        return v === output ? true : { ok: true, value: output as O };
      };
    });

    this._shape = shape;
    this._mode = mode;
    this._catchall = catchall;
  }
  passthrough(): VxObj<T, "passthrough", undefined> {
    return new VxObj(this._shape, "passthrough", undefined);
  }
  strict(): VxObj<T, "strict", undefined> {
    return new VxObj(this._shape, "strict", undefined);
  }
  strip(): VxObj<T, "strip", undefined> {
    return new VxObj(this._shape, "strip", undefined);
  }
  catchall<X>(vx: Vx<X>): VxObj<T, "catchall", X> {
    return new VxObj(this._shape, "catchall", vx);
  }
}

function number(): Vx<number> {
  const e = err("expected a number");
  return new Vx<number>(() => (v) => (typeof v === "number" ? true : e));
}
function string(): Vx<string> {
  const e = err("expected a string");
  return new Vx<string>(() => (v) => (typeof v === "string" ? true : e));
}
function boolean(): Vx<boolean> {
  const e = err("expected a boolean");
  return new Vx<boolean>(() => (v) => (typeof v === "boolean" ? true : e));
}
function undefined_(): Vx<undefined> {
  const e = err("expected undefined");
  return new Vx<undefined>(() => (v) => (v === undefined ? true : e));
}
function null_(): Vx<null> {
  const e = err("expected null");
  return new Vx<null>(() => (v) => (v === null ? true : e));
}
function object<T extends Record<string, Vx<unknown>>>(
  obj: T
): VxObj<T, "strict", undefined> {
  return new VxObj(obj, "strict", undefined);
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
