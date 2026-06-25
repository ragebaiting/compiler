import type { Type } from "./types";

export interface Pos { line: number; col: number }

export type Ann = "number" | "boolean" | "void";

export type Expr =
  | NumberLit | BoolLit | Identifier
  | UnaryExpr | BinaryExpr | LogicalExpr | AssignExpr | CallExpr;

export interface NumberLit { kind: "NumberLit"; value: number; pos: Pos; type?: Type }
export interface BoolLit { kind: "BoolLit"; value: boolean; pos: Pos; type?: Type }
export interface Identifier { kind: "Identifier"; name: string; pos: Pos; type?: Type }
export interface UnaryExpr { kind: "UnaryExpr"; op: "-" | "!"; operand: Expr; pos: Pos; type?: Type }
export interface BinaryExpr {
  kind: "BinaryExpr";
  op: "+" | "-" | "*" | "/" | "%" | "<" | "<=" | ">" | ">=" | "===" | "!==";
  left: Expr; right: Expr; pos: Pos; type?: Type;
}
export interface LogicalExpr { kind: "LogicalExpr"; op: "&&" | "||"; left: Expr; right: Expr; pos: Pos; type?: Type }
export interface AssignExpr { kind: "AssignExpr"; name: string; value: Expr; pos: Pos; type?: Type }
export interface CallExpr { kind: "CallExpr"; callee: string; args: Expr[]; pos: Pos; type?: Type }

export type Stmt =
  | VarDecl | ExprStmt | ReturnStmt | IfStmt | WhileStmt | ForStmt | Block | FuncDecl;

export interface VarDecl {
  kind: "VarDecl"; declKind: "let" | "const"; name: string;
  annotation?: Ann; init: Expr; pos: Pos;
}
export interface ExprStmt { kind: "ExprStmt"; expr: Expr; pos: Pos }
export interface ReturnStmt { kind: "ReturnStmt"; value?: Expr; pos: Pos }
export interface IfStmt { kind: "IfStmt"; cond: Expr; then: Block; else?: Block; pos: Pos }
export interface WhileStmt { kind: "WhileStmt"; cond: Expr; body: Block; pos: Pos }
export interface ForStmt {
  kind: "ForStmt"; init?: VarDecl | ExprStmt; cond?: Expr; update?: Expr; body: Block; pos: Pos;
}
export interface Block { kind: "Block"; body: Stmt[]; pos: Pos }
export interface Param { name: string; annotation: Ann; pos: Pos }
export interface FuncDecl {
  kind: "FuncDecl"; name: string; params: Param[]; returnType: Ann; body: Block; pos: Pos;
}

export interface Prog { kind: "Program"; body: Stmt[] }
