import type { Prog, Stmt, Expr, FuncDecl } from "./ast";
import type { Type } from "./types";
import { Asm } from "./ir/builder";

const dbl = (n: number) => Number.isInteger(n) ? `${n}.0` : String(n);
const ty = (t: Type) => t.kind === "number" ? "double" : t.kind === "boolean" ? "i1" : "void";

const ARITH: Record<string, string> = { "+": "fadd", "-": "fsub", "*": "fmul", "/": "fdiv", "%": "frem" };
const CMP: Record<string, string> = { "<": "olt", "<=": "ole", ">": "ogt", ">=": "oge", "===": "oeq", "!==": "one" };

interface Slot { ptr: string; type: Type }

export function codegen(program: Prog): string {
  const a = new Asm();
  const scopes: Map<string, Slot>[] = [];

  const printf = () => {
    a.declareExternal("declare i32 @printf(ptr, ...)");
    a.globalConst(`@.fmt = private unnamed_addr constant [4 x i8] c"%g\\0A\\00"`);
  };

  const push = () => scopes.push(new Map());
  const pop = () => scopes.pop();
  const bind = (name: string, s: Slot) => scopes[scopes.length - 1]!.set(name, s);
  const find = (name: string): Slot => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const s = scopes[i]!.get(name);
      if (s) return s;
    }
    throw new Error(`codegen: unbound '${name}'`);
  };
  const slot = (name: string, type: Type) => {
    const ptr = a.freshTemp();
    a.emit(`${ptr} = alloca ${ty(type)}`);
    bind(name, { ptr, type });
    return ptr;
  };

  function val(e: Expr): string {
    switch (e.kind) {
      case "NumberLit": return dbl(e.value);
      case "BoolLit": return e.value ? "true" : "false";
      case "Identifier": {
        const s = find(e.name), t = a.freshTemp();
        a.emit(`${t} = load ${ty(s.type)}, ptr ${s.ptr}`);
        return t;
      }
      case "UnaryExpr": {
        const v = val(e.operand), t = a.freshTemp();
        a.emit(e.op === "-" ? `${t} = fsub double 0.0, ${v}` : `${t} = xor i1 ${v}, true`);
        return t;
      }
      case "BinaryExpr": {
        const l = val(e.left), r = val(e.right), t = a.freshTemp();
        const op = ARITH[e.op];
        if (op) { a.emit(`${t} = ${op} double ${l}, ${r}`); return t; }
        const i1 = e.left.type?.kind === "boolean";
        const pred = i1 ? (e.op === "===" ? "eq" : "ne") : CMP[e.op]!;
        a.emit(`${t} = ${i1 ? "icmp" : "fcmp"} ${pred} ${i1 ? "i1" : "double"} ${l}, ${r}`);
        return t;
      }
      case "LogicalExpr": return short(e);
      case "AssignExpr": {
        const v = val(e.value), s = find(e.name);
        a.emit(`store ${ty(s.type)} ${v}, ptr ${s.ptr}`);
        return v;
      }
      case "CallExpr": {
        if (e.callee === "print") {
          printf();
          const v = val(e.args[0]!), t = a.freshTemp();
          a.emit(`${t} = call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.fmt, i32 0, i32 0), double ${v})`);
          return "0.0";
        }
        const args = e.args.map(x => `${ty(x.type!)} ${val(x)}`).join(", ");
        const rt = ty(e.type!);
        if (rt === "void") { a.emit(`call void @${e.callee}(${args})`); return "0.0"; }
        const t = a.freshTemp();
        a.emit(`${t} = call ${rt} @${e.callee}(${args})`);
        return t;
      }
    }
  }

  function short(e: Extract<Expr, { kind: "LogicalExpr" }>): string {
    const cell = a.freshTemp();
    a.emit(`${cell} = alloca i1`);
    const l = val(e.left);
    a.emit(`store i1 ${l}, ptr ${cell}`);
    const rhs = a.freshLabel(e.op === "&&" ? "and.rhs" : "or.rhs");
    const end = a.freshLabel(e.op === "&&" ? "and.end" : "or.end");
    a.emit(e.op === "&&"
      ? `br i1 ${l}, label %${rhs}, label %${end}`
      : `br i1 ${l}, label %${end}, label %${rhs}`);
    a.label(rhs);
    a.emit(`store i1 ${val(e.right)}, ptr ${cell}`);
    a.emit(`br label %${end}`);
    a.label(end);
    const out = a.freshTemp();
    a.emit(`${out} = load i1, ptr ${cell}`);
    return out;
  }

  function gIf(s: Extract<Stmt, { kind: "IfStmt" }>) {
    const c = val(s.cond);
    const then = a.freshLabel("then"), alt = a.freshLabel("else"), end = a.freshLabel("endif");
    a.emit(`br i1 ${c}, label %${then}, label %${s.else ? alt : end}`);
    a.label(then);
    stmt(s.then);
    if (!a.isTerminated()) a.emit(`br label %${end}`);
    if (s.else) {
      a.label(alt);
      stmt(s.else);
      if (!a.isTerminated()) a.emit(`br label %${end}`);
    }
    a.label(end);
  }

  function gWhile(s: Extract<Stmt, { kind: "WhileStmt" }>) {
    const cond = a.freshLabel("while.cond"), body = a.freshLabel("while.body"), end = a.freshLabel("while.end");
    a.emit(`br label %${cond}`);
    a.label(cond);
    a.emit(`br i1 ${val(s.cond)}, label %${body}, label %${end}`);
    a.label(body);
    stmt(s.body);
    if (!a.isTerminated()) a.emit(`br label %${cond}`);
    a.label(end);
  }

  function gFor(s: Extract<Stmt, { kind: "ForStmt" }>) {
    push();
    if (s.init?.kind === "VarDecl") stmt(s.init);
    else if (s.init?.kind === "ExprStmt") val(s.init.expr);
    const cond = a.freshLabel("for.cond"), body = a.freshLabel("for.body");
    const upd = a.freshLabel("for.update"), end = a.freshLabel("for.end");
    a.emit(`br label %${cond}`);
    a.label(cond);
    if (s.cond) a.emit(`br i1 ${val(s.cond)}, label %${body}, label %${end}`);
    else a.emit(`br label %${body}`);
    a.label(body);
    stmt(s.body);
    if (!a.isTerminated()) a.emit(`br label %${upd}`);
    a.label(upd);
    if (s.update) val(s.update);
    a.emit(`br label %${cond}`);
    a.label(end);
    pop();
  }

  function stmt(s: Stmt): void {
    if (a.isTerminated()) return;
    switch (s.kind) {
      case "VarDecl": {
        const v = val(s.init), t = s.init.type!, ptr = slot(s.name, t);
        a.emit(`store ${ty(t)} ${v}, ptr ${ptr}`);
        break;
      }
      case "ExprStmt": val(s.expr); break;
      case "ReturnStmt":
        if (s.value) a.emit(`ret ${ty(s.value.type!)} ${val(s.value)}`);
        else a.emit("ret void");
        break;
      case "Block": push(); s.body.forEach(stmt); pop(); break;
      case "IfStmt": gIf(s); break;
      case "WhileStmt": gWhile(s); break;
      case "ForStmt": gFor(s); break;
      case "FuncDecl": break;
    }
  }

  function gFn(f: FuncDecl) {
    const params = f.params.map((p, i) => `${ty({ kind: p.annotation } as Type)} %a${i}`).join(", ");
    const rt = ty({ kind: f.returnType } as Type);
    a.startFunction(`define ${rt} @${f.name}(${params})`);
    push();
    f.params.forEach((p, i) => {
      const t = { kind: p.annotation } as Type;
      a.emit(`store ${ty(t)} %a${i}, ptr ${slot(p.name, t)}`);
    });
    f.body.body.forEach(stmt);
    if (!a.isTerminated()) a.emit(rt === "void" ? "ret void" : `ret ${rt} ${rt === "double" ? "0.0" : "false"}`);
    pop();
    a.endFunction();
  }

  for (const s of program.body) if (s.kind === "FuncDecl") gFn(s);

  a.startFunction("define i32 @main()");
  push();
  for (const s of program.body) if (s.kind !== "FuncDecl") stmt(s);
  if (!a.isTerminated()) a.emit("ret i32 0");
  pop();
  a.endFunction();

  return a.toString();
}
