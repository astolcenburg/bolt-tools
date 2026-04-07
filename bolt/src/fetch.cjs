/*
 * If not stated otherwise in this file or this component's LICENSE file the
 * following copyright and licenses apply:
 *
 * Copyright 2026 RDK Management
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

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { spawnSync } = require('node:child_process');
const { Package } = require('./Package.cjs');
const { PackageStore } = require('./PackageStore.cjs');
const { GLOBAL_CONFIG_PATH } = require('./config.cjs');
const fetchBasic = require('./fetch-basic.cjs');
const fetchRdk = require('./fetch-rdk.cjs');

const CONFIG_DIR = path.dirname(GLOBAL_CONFIG_PATH);
const DATA_DIR = path.join(CONFIG_DIR, 'data');
const PLUGINS_DIR = path.join(CONFIG_DIR, 'plugins');

class HTTPError extends Error {
  constructor(statusCode, url) {
    super(`HTTP ${statusCode}: ${url}`);
    this.statusCode = statusCode;
  }
}

async function openURL(url, requestOptions = {}) {
  for (let i = 0; i <= 5; i++) {
    const protocol = url.startsWith('https://') ? https : http;
    const res = await new Promise((resolve, reject) => {
      protocol.get(url, requestOptions, resolve).on('error', reject);
    });

    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      const redirectURL = new URL(res.headers.location, url).href;
      if (!redirectURL.startsWith('http://') && !redirectURL.startsWith('https://')) {
        throw new Error(`Refusing to follow redirect to non-HTTP URL: ${redirectURL}`);
      }
      if (url.startsWith('https://') && !redirectURL.startsWith('https://')) {
        throw new Error(`Refusing to follow HTTPS to HTTP redirect for ${url}`);
      }
      url = redirectURL;
      console.log(`Redirected to ${url}`);
      continue;
    }

    if (res.statusCode !== 200) {
      res.resume();
      throw new HTTPError(res.statusCode, url);
    }

    return res;
  }
  throw new Error(`Too many redirects for ${url}`);
}

async function download(url, dest, requestOptions = {}) {
  const tmpPath = dest + '~';
  try {
    const res = await openURL(url, requestOptions);
    const totalSize = parseInt(res.headers['content-length'], 10) || 0;
    let downloaded = 0;
    let lastPrint = 0;

    const printProgress = () => {
      const mib = (downloaded / 1024 / 1024).toFixed(1);
      const percent = totalSize ? ` (${Math.round(downloaded / totalSize * 100)}%)` : '';
      process.stdout.write(`\rDownloading... ${mib} MiB${percent}`);
    };

    const progress = new Transform({
      transform(chunk, encoding, callback) {
        downloaded += chunk.length;
        const now = Date.now();
        if (now - lastPrint >= 100) {
          lastPrint = now;
          printProgress();
        }
        callback(null, chunk);
      }
    });

    await pipeline(res, progress, fs.createWriteStream(tmpPath));
    printProgress();
    fs.renameSync(tmpPath, dest);
  } catch (e) {
    fs.rmSync(tmpPath, { force: true });
    throw e;
  } finally {
    process.stdout.write('\n');
  }
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const protocol = url.startsWith('https://') ? https : http;
    const req = protocol.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

async function promptCredentials(username) {
  if (!process.stdin.isTTY) {
    throw new Error('Cannot prompt for credentials: stdin is not a terminal');
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  try {
    username = username || await rl.question('Username: ');
    const echoOff = spawnSync('stty', ['-echo'], { stdio: 'inherit' }).status === 0;
    try {
      const password = await rl.question('Password: ');
      if (echoOff) process.stderr.write('\n');
      return { username, password };
    } finally {
      if (echoOff) spawnSync('stty', ['echo'], { stdio: 'inherit' });
    }
  } finally {
    rl.close();
  }
}

function loadServerData(dataPath) {
  try {
    return fs.readFileSync(dataPath, 'utf-8').trim();
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function saveServerData(dataPath, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(dataPath, data, { mode: 0o600 });
}

function getServerDataPath(serverURL, type) {
  const name = serverURL.replace(/[^a-zA-Z0-9.-]/g, '_');
  return path.join(DATA_DIR, `${name}.${type}.data`);
}

function loadMethod(name) {
  switch (name) {
    case 'basic': return fetchBasic;
    case 'rdk': return fetchRdk;
  }

  const customPath = path.resolve(PLUGINS_DIR, `fetch-${name}.cjs`);
  if (!customPath.startsWith(path.join(PLUGINS_DIR, ''))) {
    throw new Error(`Invalid package store type: "${name}"`);
  }
  let stat;
  try {
    stat = fs.statSync(customPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Unknown package store type: "${name}". No fetch-${name}.cjs found in ${PLUGINS_DIR}`);
    }
    throw err;
  }

  if (!stat.isFile()) {
    throw new Error(`Refusing to load ${customPath}: not a regular file`);
  }

  if (process.getuid) {
    if (stat.uid !== process.getuid()) {
      throw new Error(`Refusing to load ${customPath}: not owned by the current user`);
    }
    if (stat.mode & 0o022) {
      throw new Error(`Refusing to load ${customPath}: writable by group or others (mode ${(stat.mode & 0o777).toString(8)})`);
    }
  }

  const method = require(customPath);
  if (typeof method !== 'function') {
    throw new Error(`Plugin ${customPath} does not export a function`);
  }
  return method;
}

async function fetch(packageName, options) {
  if (!options.packageStoreURL) {
    throw new Error('No package store URL configured. Set "packageStoreURL" in ~/.bolt/config.json');
  }

  const packageStore = PackageStore.find(process.cwd());
  if (!packageStore) {
    throw new Error('Local package store not found');
  }

  const packageFileName = Package.isPackageFileName(packageName)
    ? packageName
    : Package.makeFileName(packageName);
  const packageFullName = Package.pathToFullName(packageFileName);
  const dest = packageStore.generatePackagePath(packageFullName);

  const destStat = fs.statSync(dest, { throwIfNoEntry: false });
  if (destStat && !destStat.isFile()) {
    throw new Error(`${packageFileName} (${dest}) exists but is not a regular file`);
  }
  if (destStat && !options.force) {
    throw new Error(`${packageFileName} already exists in the local package store. Use --force to replace it.`);
  }

  const base = options.packageStoreURL.endsWith('/') ? options.packageStoreURL.slice(0, -1) : options.packageStoreURL;
  const methodName = options.packageStoreType || 'basic';
  const dataPath = getServerDataPath(options.packageStoreURL, methodName);
  const method = loadMethod(methodName);
  const handler = method({
    postJSON,
    promptCredentials,
    downloadPackage: (url, opts) => download(url, dest, opts),
    loadData: () => loadServerData(dataPath),
    saveData: (data) => saveServerData(dataPath, data),
  });

  await handler(base, packageFileName, options);

  console.log(`Fetched ${packageFileName} into ${packageStore.getPath()}`);
}

exports.fetch = fetch;

exports.fetchOptions = {
  packageStoreURL(params, result) {
    return !!(result.packageStoreURL = params.options.packageStoreURL);
  },

  packageStoreType(params, result) {
    return !!(result.packageStoreType = params.options.packageStoreType);
  },

  packageStoreUser(params, result) {
    return !!(result.packageStoreUser = params.options.packageStoreUser);
  },

  force(params, result) {
    return (result.force = (params.options.force === ''));
  },
};
