import type { Prog, Stmt, Expr, Block, FuncDecl, Pos } from "./ast";
import type { Diag } from "./diagnostics";
import { type Type, tNumber, tBoolean, tVoid, toType, same, show } from "./types";

interface Sym { type: Type; mutable: boolean }

class Env {
  private vars = new Map<string, Sym>();
  constructor(readonly parent?: Env) {}
  def(name: string, s: Sym) { this.vars.set(name, s); }
  own(name: string) { return this.vars.has(name); }
  get(name: string): Sym | undefined { return this.vars.get(name) ?? this.parent?.get(name); }
}

const ARITH = ["+", "-", "*", "/", "%"];

export function check(program: Prog): { diagnostics: Diag[] } {
  const diags: Diag[] = [];
  const err = (message: string, p: Pos) => diags.push({ stage: "type", message, line: p.line, col: p.col });

  const root = new Env();
  root.def("print", { type: { kind: "function", params: [tNumber], ret: tVoid }, mutable: false });

  for (const s of program.body) {
    if (s.kind !== "FuncDecl") continue;
    const sig: Type = { kind: "function", params: s.params.map(p => toType(p.annotation)), ret: toType(s.returnType) };
    if (root.own(s.name)) err(`duplicate declaration of '${s.name}'`, s.pos);
    root.def(s.name, { type: sig, mutable: false });
  }

  let ret: Type = tVoid;
  let inFn = false;

  const returns = (s: Stmt): boolean =>
    s.kind === "ReturnStmt" ? true
      : s.kind === "Block" ? s.body.some(returns)
      : s.kind === "IfStmt" ? !!s.else && returns(s.then) && returns(s.else)
      : false;

  function expr(e: Expr, env: Env): Type {
    return (e.type = infer(e, env));
  }

  function infer(e: Expr, env: Env): Type {
    switch (e.kind) {
      case "NumberLit": return tNumber;
      case "BoolLit": return tBoolean;
      case "Identifier": {
        const s = env.get(e.name);
        if (!s) { err(`undefined variable '${e.name}'`, e.pos); return tNumber; }
        return s.type;
      }
      case "UnaryExpr": {
        const t = expr(e.operand, env);
        if (e.op === "-") { if (!same(t, tNumber)) err(`unary '-' requires number`, e.pos); return tNumber; }
        if (!same(t, tBoolean)) err(`unary '!' requires boolean`, e.pos);
        return tBoolean;
      }
      case "BinaryExpr": {
        const l = expr(e.left, env), r = expr(e.right, env);
        if (ARITH.includes(e.op)) {
          if (!same(l, tNumber) || !same(r, tNumber)) err(`operator '${e.op}' requires number operands`, e.pos);
          return tNumber;
        }
        if (e.op === "===" || e.op === "!==") {
          if (!same(l, r)) err(`'${e.op}' requires operands of the same type`, e.pos);
        } else if (!same(l, tNumber) || !same(r, tNumber)) {
          err(`operator '${e.op}' requires number operands`, e.pos);
        }
        return tBoolean;
      }
      case "LogicalExpr": {
        const l = expr(e.left, env), r = expr(e.right, env);
        if (!same(l, tBoolean) || !same(r, tBoolean)) err(`'${e.op}' requires boolean operands`, e.pos);
        return tBoolean;
      }
      case "AssignExpr": {
        const s = env.get(e.name);
        const v = expr(e.value, env);
        if (!s) { err(`undefined variable '${e.name}'`, e.pos); return v; }
        if (!s.mutable) err(`cannot assign to const '${e.name}'`, e.pos);
        if (!same(s.type, v)) err(`cannot assign ${show(v)} to ${show(s.type)}`, e.pos);
        return s.type;
      }
      case "CallExpr": {
        const s = env.get(e.callee);
        if (!s) { err(`undefined function '${e.callee}'`, e.pos); e.args.forEach(a => expr(a, env)); return tNumber; }
        if (s.type.kind !== "function") { err(`'${e.callee}' is not a function`, e.pos); return tNumber; }
        const sig = s.type;
        if (e.args.length !== sig.params.length)
          err(`'${e.callee}' expects ${sig.params.length} argument(s) but got ${e.args.length}`, e.pos);
        e.args.forEach((a, k) => {
          const got = expr(a, env), want = sig.params[k];
          if (want && !same(got, want)) err(`argument ${k + 1} of '${e.callee}' expects ${show(want)}`, a.pos);
        });
        return sig.ret;
      }
    }
  }

  function scope(b: Block, parent: Env) {
    const env = new Env(parent);
    for (const s of b.body) stmt(s, env);
  }

  function stmt(s: Stmt, env: Env) {
    switch (s.kind) {
      case "VarDecl": {
        const v = expr(s.init, env);
        const t = s.annotation ? toType(s.annotation) : v;
        if (s.annotation && !same(t, v)) err(`cannot initialize ${show(t)} with ${show(v)}`, s.pos);
        if (same(t, tVoid)) err(`cannot declare a variable of type void`, s.pos);
        if (env.own(s.name)) err(`duplicate declaration of '${s.name}'`, s.pos);
        env.def(s.name, { type: t, mutable: s.declKind === "let" });
        break;
      }
      case "ExprStmt": expr(s.expr, env); break;
      case "ReturnStmt": {
        if (!inFn) { err(`return statement is not allowed outside of a function`, s.pos); break; }
        const t = s.value ? expr(s.value, env) : tVoid;
        if (!same(t, ret)) err(`return type ${show(t)} does not match ${show(ret)}`, s.pos);
        break;
      }
      case "IfStmt": {
        if (!same(expr(s.cond, env), tBoolean)) err(`if condition must be boolean`, s.pos);
        scope(s.then, env);
        if (s.else) scope(s.else, env);
        break;
      }
      case "WhileStmt": {
        if (!same(expr(s.cond, env), tBoolean)) err(`while condition must be boolean`, s.pos);
        scope(s.body, env);
        break;
      }
      case "ForStmt": {
        const e = new Env(env);
        if (s.init?.kind === "VarDecl") stmt(s.init, e);
        else if (s.init?.kind === "ExprStmt") expr(s.init.expr, e);
        if (s.cond && !same(expr(s.cond, e), tBoolean)) err(`for condition must be boolean`, s.pos);
        if (s.update) expr(s.update, e);
        scope(s.body, e);
        break;
      }
      case "Block": scope(s, env); break;
      case "FuncDecl": err("nested function declarations are not supported", s.pos); break;
    }
  }

  function fn(f: FuncDecl) {
    const env = new Env(root);
    for (const p of f.params) env.def(p.name, { type: toType(p.annotation), mutable: true });
    const savedRet = ret, savedIn = inFn;
    ret = toType(f.returnType);
    inFn = true;
    scope(f.body, env);
    if (f.returnType !== "void" && !returns(f.body))
      err(`function '${f.name}' must return a value on all code paths`, f.pos);
    ret = savedRet;
    inFn = savedIn;
  }

  for (const s of program.body) s.kind === "FuncDecl" ? fn(s) : stmt(s, root);
  return { diagnostics: diags };
}
