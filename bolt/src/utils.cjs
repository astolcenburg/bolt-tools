/*
 * If not stated otherwise in this file or this component's LICENSE file the
 * following copyright and licenses apply:
 *
 * Copyright 2025 RDK Management
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

const { renameSync, copyFileSync, linkSync, unlinkSync, mkdtempSync, statSync, lstatSync, rmSync, realpathSync } = require('node:fs');
const { join, dirname, basename, isAbsolute, resolve, relative, sep } = require('node:path');
const { execSync, execFileSync } = require('node:child_process');
const config = require('./config.cjs');

function runSync(params, run) {
  try {
    return run(Object.assign({
      stdio: 'pipe',
      encoding: 'utf8',
    }, params));
  } catch (err) {

    if (err.code) {
      if (config.verbose) console.error(err.code);
    } else {
      const { stdout, stderr } = err;
      if (config.verbose) console.error({ stdout, stderr });
    }

    if (config.verbose) console.error(err.stack);

    throw err;
  }
}

function execNoOutput(command, params) {
  if (config.verbose) console.log(command);
  return runSync(params, opts => execSync(command, opts));
}

function exec(command, params) {
  const output = execNoOutput(command, params);
  if (config.verbose && output) console.log(output.trim());
  return output;
}

function execv(file, args, params) {
  if (config.verbose) console.log(`${file} ${args.join(' ')}`);
  const output = runSync(params, opts => execFileSync(file, args, opts));
  if (config.verbose && output) console.log(output.trim());
  return output;
}

function moveSync(from, to) {
  try {
    renameSync(from, to);
  } catch (err) {
    if (err.code === 'EXDEV') {
      copyFileSync(from, to);
      unlinkSync(from);
    } else {
      throw err;
    }
  }
}

function linkOrCopySync(from, to, overwrite) {
  try {
    linkSync(from, to);
  } catch (err) {
    try {
      if (err.code === 'EEXIST' && overwrite) {
        unlinkSync(to);
        linkSync(from, to);
      } else {
        throw err;
      }
    } catch (err) {
      if (err.code === 'EXDEV') {
        copyFileSync(from, to);
      } else {
        throw err;
      }
    }
  }
}

function printError(e) {
  if (!config.verbose) {
    console.error(`${e}`);
  } else {
    console.error(`${e.stack}`);
  }
}

function makeWorkDir() {
  return mkdtempSync(join(process.cwd(), 'tmp-'));
}

function resolvePath(resolveDir, path) {
  return isAbsolute(path) ? path : resolve(resolveDir, path);
}

function assertFile(path) {
  if (!statSync(path).isFile()) {
    throw new Error(`Not a file: ${path}`);
  }
}

function removeUnder(baseDir, relPath) {
  const base = realpathSync(resolve(baseDir));
  const target = resolve(base, relPath);

  let realTarget;
  try {
    realTarget = join(realpathSync(dirname(target)), basename(target));
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }

  const rel = relative(base, realTarget);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Refusing to remove ${JSON.stringify(relPath)}: resolves to or outside ${baseDir}`);
  }
  if (lstatSync(realTarget, { throwIfNoEntry: false })) {
    rmSync(realTarget, { recursive: true, force: true });
    return true;
  }
  return false;
}

exports.exec = exec;
exports.execv = execv;
exports.execNoOutput = execNoOutput;
exports.moveSync = moveSync;
exports.linkOrCopySync = linkOrCopySync;
exports.printError = printError;
exports.makeWorkDir = makeWorkDir;
exports.resolvePath = resolvePath;
exports.assertFile = assertFile;
exports.removeUnder = removeUnder;
