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

async function login(ctx, base, credentials) {
  const res = await ctx.postJSON(`${base}/auth/login`, {
    username: credentials.username,
    password: credentials.password,
  });

  if (res.statusCode !== 200) {
    throw new Error(`Authentication failed: HTTP ${res.statusCode}`);
  }

  const setCookie = res.headers['set-cookie'];
  if (!setCookie) {
    throw new Error('Authentication failed: no cookie received from server');
  }

  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return cookieHeader.split(';')[0].trim();
}

module.exports = function(ctx) {
  return async function(packageStoreURL, packageFileName, options) {
    const packagePath = packageFileName.includes('/') ? packageFileName : `arm/${packageFileName}`;
    const url = `${packageStoreURL}/appcatalog/bolts/${packagePath}`;
    let cookie = ctx.loadData();
    let prompted = false;

    if (!cookie) {
      const credentials = await ctx.promptCredentials(options.packageStoreUser);
      prompted = true;
      cookie = await login(ctx, packageStoreURL, credentials);
      ctx.saveData(cookie);
    }

    try {
      await ctx.downloadPackage(url, { headers: { Cookie: cookie } });
    } catch (err) {
      if ((err.statusCode === 401 || err.statusCode === 403) && !prompted) {
        console.log('Session expired, re-authenticating...');
        const credentials = await ctx.promptCredentials(options.packageStoreUser);
        cookie = await login(ctx, packageStoreURL, credentials);
        ctx.saveData(cookie);
        await ctx.downloadPackage(url, { headers: { Cookie: cookie } });
      } else {
        throw err;
      }
    }
  };
};
