#!/usr/bin/env node --experimental-strip-types

import { main } from '../src/index.ts';

const args = process.argv.slice(2);
main({ argv: args });
