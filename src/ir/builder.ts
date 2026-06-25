export class Asm {
  private externs = new Set<string>();
  private globals = new Set<string>();
  private fns: string[] = [];
  private cur: string[] | null = null;
  private nTmp = 0;
  private nLbl = 0;
  private term = false;

  freshTemp() { return `%t${this.nTmp++}`; }
  freshLabel(base: string) { return `${base}.${this.nLbl++}`; }

  declareExternal(line: string) { this.externs.add(line); }
  globalConst(line: string) { this.globals.add(line); }

  startFunction(sig: string) { this.cur = [`${sig} {`]; this.term = false; }
  label(name: string) { this.cur!.push(`${name}:`); this.term = false; }

  emit(line: string) {
    this.cur!.push(`  ${line}`);
    const op = line.trim().split(/\s+/)[0];
    if (op === "ret" || op === "br") this.term = true;
  }

  endFunction() { this.cur!.push("}"); this.fns.push(this.cur!.join("\n")); this.cur = null; }
  isTerminated() { return this.term; }

  toString() {
    return ["; ModuleID = 'tsllvm'", ...this.externs, ...this.globals, "", ...this.fns, ""].join("\n");
  }
}
