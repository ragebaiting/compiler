#!/usr/bin/env bun
import { run } from "./cli";
process.exit(await run(Bun.argv));
