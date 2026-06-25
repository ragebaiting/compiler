import type { Token, Kind } from "./token";
import type { Diag } from "./diagnostics";
import type {
  Prog, Stmt, Expr, Block, VarDecl, FuncDecl, Param, Ann, Pos, ExprStmt,
} from "./ast";

class Bail extends Error {}

export function parse(tokens: Token[]): { program: Prog; diagnostics: Diag[] } {
  const diags: Diag[] = [];
  let i = 0;

  const peek = () => tokens[i]!;
  const end = () => peek().kind === "EOF";
  const at = (k: Kind) => !end() && peek().kind === k;
  const eat = () => tokens[i++]!;
  const pos = (t: Token): Pos => ({ line: t.line, col: t.col });
  const bail = (msg: string, p: Pos = peek()): never => {
    throw new Bail(JSON.stringify({ stage: "parse", message: msg, line: p.line, col: p.col }));
  };
  const want = (k: Kind) => (at(k) ? eat() : bail(`expected '${k}' but found '${peek().kind}'`));

  const expr = (): Expr => assign();

  function assign(): Expr {
    const l = or();
    if (!at("=")) return l;
    eat();
    const value = assign();
    if (l.kind !== "Identifier") bail("invalid assignment target", l.pos);
    return { kind: "AssignExpr", name: (l as { name: string }).name, value, pos: l.pos };
  }

  function bin(next: () => Expr, ops: Kind[], logical = false): Expr {
    let l = next();
    while (ops.includes(peek().kind)) {
      const op = eat().kind as any;
      const right = next();
      l = logical
        ? { kind: "LogicalExpr", op, left: l, right, pos: l.pos }
        : { kind: "BinaryExpr", op, left: l, right, pos: l.pos };
    }
    return l;
  }

  const or = () => bin(and, ["||"], true);
  const and = () => bin(eq, ["&&"], true);
  const eq = () => bin(rel, ["===", "!=="]);
  const rel = () => bin(add, ["<", "<=", ">", ">="]);
  const add = () => bin(mul, ["+", "-"]);
  const mul = () => bin(unary, ["*", "/", "%"]);

  function unary(): Expr {
    if (at("-") || at("!")) {
      const t = eat();
      return { kind: "UnaryExpr", op: t.kind as "-" | "!", operand: unary(), pos: pos(t) };
    }
    return call();
  }

  function call(): Expr {
    const e = atom();
    if (e.kind !== "Identifier" || !at("(")) return e;
    const open = eat();
    const args: Expr[] = [];
    if (!at(")")) do { args.push(expr()); } while (at(",") && eat());
    want(")");
    return { kind: "CallExpr", callee: e.name, args, pos: pos(open) };
  }

  function atom(): Expr {
    const t = peek();
    if (at("Number")) return eat(), { kind: "NumberLit", value: Number(t.value), pos: pos(t) };
    if (at("true")) return eat(), { kind: "BoolLit", value: true, pos: pos(t) };
    if (at("false")) return eat(), { kind: "BoolLit", value: false, pos: pos(t) };
    if (at("Identifier")) return eat(), { kind: "Identifier", name: t.value, pos: pos(t) };
    if (at("(")) { eat(); const e = expr(); want(")"); return e; }
    return bail(`unexpected token '${t.kind}'`);
  }

  function ann(): Ann {
    const t = peek();
    if (at("number") || at("boolean") || at("void")) return eat(), t.kind as Ann;
    return bail(`expected a type but found '${t.kind}'`);
  }

  function block(): Block {
    const open = want("{");
    const body: Stmt[] = [];
    while (!at("}") && !end()) body.push(stmt());
    want("}");
    return { kind: "Block", body, pos: pos(open) };
  }

  function decl(): VarDecl {
    const kw = eat();
    const name = want("Identifier").value;
    const annotation = at(":") ? (eat(), ann()) : undefined;
    want("=");
    const init = expr();
    want(";");
    return { kind: "VarDecl", declKind: kw.kind as "let" | "const", name, annotation, init, pos: pos(kw) };
  }

  function func(): FuncDecl {
    const kw = eat();
    const name = want("Identifier").value;
    want("(");
    const params: Param[] = [];
    if (!at(")")) do {
      const p = want("Identifier");
      want(":");
      params.push({ name: p.value, annotation: ann(), pos: pos(p) });
    } while (at(",") && eat());
    want(")"); want(":");
    const returnType = ann();
    return { kind: "FuncDecl", name, params, returnType, body: block(), pos: pos(kw) };
  }

  function stmt(): Stmt {
    const t = peek();
    if (at("let") || at("const")) return decl();
    if (at("function")) return func();
    if (at("{")) return block();
    if (at("if")) {
      eat(); want("("); const cond = expr(); want(")");
      const then = block();
      const alt = at("else") ? (eat(), at("if") ? wrap(stmt()) : block()) : undefined;
      return { kind: "IfStmt", cond, then, else: alt, pos: pos(t) };
    }
    if (at("while")) {
      eat(); want("("); const cond = expr(); want(")");
      return { kind: "WhileStmt", cond, body: block(), pos: pos(t) };
    }
    if (at("for")) {
      eat(); want("(");
      let init: VarDecl | ExprStmt | undefined;
      if (at("let") || at("const")) init = decl();
      else if (!at(";")) { const e = expr(); want(";"); init = { kind: "ExprStmt", expr: e, pos: e.pos }; }
      else eat();
      const cond = at(";") ? undefined : expr();
      want(";");
      const update = at(")") ? undefined : expr();
      want(")");
      return { kind: "ForStmt", init, cond, update, body: block(), pos: pos(t) };
    }
    if (at("return")) {
      eat();
      const value = at(";") ? undefined : expr();
      want(";");
      return { kind: "ReturnStmt", value, pos: pos(t) };
    }
    const e = expr(); want(";");
    return { kind: "ExprStmt", expr: e, pos: e.pos };
  }

  const wrap = (s: Stmt): Block => ({ kind: "Block", body: [s], pos: s.pos });

  const body: Stmt[] = [];
  while (!end()) {
    try {
      body.push(stmt());
    } catch (e) {
      if (!(e instanceof Bail)) throw e;
      diags.push(JSON.parse(e.message));
      while (!end() && !at(";") && !at("}")) eat();
      if (at(";") || at("}")) eat();
    }
  }
  return { program: { kind: "Program", body }, diagnostics: diags };
}
