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

const crypto = require('node:crypto');
const fs = require('node:fs');
const { READ_CHUNK_SIZE } = require('../config.cjs');

function feedFile(updatable, dataPath) {
  const fd = fs.openSync(dataPath, 'r');
  const buf = Buffer.allocUnsafe(READ_CHUNK_SIZE);
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length)) > 0) {
      updatable.update(buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
}

function hash(dataBuf) {
  return crypto.createHash('sha256').update(dataBuf).digest('hex');
}

function hashFile(dataPath) {
  const hash = crypto.createHash('sha256');
  feedFile(hash, dataPath);
  return hash.digest('hex');
}

function sign(dataBuf, keyPath) {
  const privateKey = fs.readFileSync(keyPath);
  const sign = crypto.createSign('sha256');
  sign.update(dataBuf);
  sign.end();
  return sign.sign(privateKey, 'base64');
}

function signFile(dataPath, keyPath) {
  const privateKey = fs.readFileSync(keyPath);
  const sign = crypto.createSign('sha256');
  feedFile(sign, dataPath);
  sign.end();
  return sign.sign(privateKey, 'base64');
}

function verify(dataBuf, certPath, signatureBase64) {
  const certificate = fs.readFileSync(certPath);
  const verify = crypto.createVerify('sha256');
  verify.update(dataBuf);
  verify.end();
  return verify.verify(certificate, signatureBase64, 'base64');
}

function verifyFile(dataPath, certPath, signatureBase64) {
  const certificate = fs.readFileSync(certPath);
  const verify = crypto.createVerify('sha256');
  feedFile(verify, dataPath);
  verify.end();
  return verify.verify(certificate, signatureBase64, 'base64');
}

exports.hash = hash;
exports.hashFile = hashFile;
exports.sign = sign;
exports.signFile = signFile;
exports.verify = verify;
exports.verifyFile = verifyFile;
