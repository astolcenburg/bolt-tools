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

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.cjs');
const { linkOrCopySync } = require('./utils.cjs');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse JSON ${filePath}: ${err}`);
  }
}

function readSpdxDocument(documentPath) {
  const result = readJson(documentPath);

  if (result.spdxVersion !== "SPDX-2.2") {
    throw new Error(`Unsupported SPDX version in ${documentPath}: got ${result.spdxVersion}, expected SPDX-2.2.`);
  }

  return result;
}

function getLicense(pkg) {
  if (pkg.licenseConcluded && pkg.licenseConcluded !== 'NOASSERTION') {
    return pkg.licenseConcluded;
  }
  if (pkg.licenseDeclared) {
    return pkg.licenseDeclared;
  }
  return 'NOASSERTION';
}

function areSourcesNeeded(pkg) {
  // 'GPL' substring covers GPL/LGPL/AGPL
  const licenseStrings = ['GPL', 'NOASSERTION'];
  const license = getLicense(pkg).toUpperCase();
  return licenseStrings.some(str => license.includes(str));
}

function shrinkDocument(doc) {
  const fileIds = new Set();

  for (const file of doc.files ?? []) {
    fileIds.add(file.SPDXID);
  }
  delete doc.files;

  for (const pkg of doc.packages ?? []) {
    delete pkg.hasFiles;
  }

  const relationships = [];

  for (const rel of doc.relationships ?? []) {
    switch (rel.relationshipType) {
      case 'BUILD_DEPENDENCY_OF':
      case 'RUNTIME_DEPENDENCY_OF':
        relationships.push(rel);
        break;
      case 'CONTAINS':
        if (!fileIds.has(rel.relatedSpdxElement)) {
          relationships.push(rel);
        }
        break;
      case 'GENERATED_FROM':
        if (!fileIds.has(rel.spdxElementId)) {
          relationships.push(rel);
        }
        break;
      case 'OTHER':
      case 'AMENDS':
      case 'DESCRIBES':
        break;
      default:
        console.warn(`Other relationship: ${rel.relationshipType}`);
        break;
    }
  }

  doc.relationships = relationships;
}

function stripDocumentRef(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(/^DocumentRef-[\w.-]+:/, "");
}

function stripLicenseDocumentRef(license) {
  if (typeof license !== 'string') {
    return 'NOASSERTION';
  }
  return license.replace(/DocumentRef-[\w.-]+:/g, "");
}

function flattenSpdxRefs(document) {
  for (const rel of document.relationships ?? []) {
    rel.relatedSpdxElement = stripDocumentRef(rel.relatedSpdxElement);
    rel.spdxElementId = stripDocumentRef(rel.spdxElementId);
  }
  for (const pkg of document.packages ?? []) {
    pkg.licenseConcluded = stripLicenseDocumentRef(pkg.licenseConcluded);
    pkg.licenseDeclared = stripLicenseDocumentRef(pkg.licenseDeclared);
  }
}

function makeDocumentMap(indexData) {
  const result = new Map();

  for (const document of indexData.documents) {
    result.set(document.documentNamespace, document.filename);
  }

  return result;
}

function loadIndex(sbomDir) {
  const indexPath = path.join(sbomDir, 'index.json');

  if (!fs.existsSync(indexPath)) {
    throw new Error(`Index file not found at ${indexPath}`);
  }

  const indexData = readJson(indexPath);

  if (!Array.isArray(indexData.documents)) {
    throw new Error(`Index file invalid ${indexPath}`);
  }

  return indexData;
}

function findImageDocumentPath(indexData, sbomDir, imageName, machine) {
  for (const document of indexData.documents) {
    if (document.filename.startsWith(`${imageName}-${machine}`) && document.filename.endsWith('.spdx.json')) {
      return path.join(sbomDir, document.filename);
    }
  }
  throw new Error(`Image document not found: no ${imageName}-${machine}*.spdx.json in ${sbomDir}`);
}

function getFilePath(documentMap, sbomDir, spdxDocument) {
  const filename = documentMap.get(spdxDocument);
  if (!filename) {
    throw new Error(`SPDX document not found in index: ${spdxDocument}`);
  }
  return path.join(sbomDir, filename);
}

function inlineAndShrink(imageDocument, documentMap, sbomDir) {
  const visitedDocuments = new Set([imageDocument.documentNamespace]);
  const extractedLicenses = new Map();

  shrinkDocument(imageDocument);
  flattenSpdxRefs(imageDocument);

  if (!Array.isArray(imageDocument.externalDocumentRefs)) {
    return;
  }

  if (!imageDocument.hasExtractedLicensingInfos) {
    imageDocument.hasExtractedLicensingInfos = [];
  }

  for (const extractedLicensingInfo of imageDocument.hasExtractedLicensingInfos) {
    extractedLicenses.set(extractedLicensingInfo.licenseId, extractedLicensingInfo.extractedText);
  }

  while (imageDocument.externalDocumentRefs.length) {
    const extDocument = imageDocument.externalDocumentRefs.pop();
    if (visitedDocuments.has(extDocument.spdxDocument)) {
      continue;
    }
    visitedDocuments.add(extDocument.spdxDocument);
    const filePath = getFilePath(documentMap, sbomDir, extDocument.spdxDocument);
    const extDocumentContents = readSpdxDocument(filePath);
    shrinkDocument(extDocumentContents);
    flattenSpdxRefs(extDocumentContents);
    imageDocument.packages.push(...extDocumentContents.packages ?? []);
    imageDocument.relationships.push(...extDocumentContents.relationships ?? []);
    imageDocument.externalDocumentRefs.push(...extDocumentContents.externalDocumentRefs ?? []);
    for (const extractedLicensingInfo of extDocumentContents.hasExtractedLicensingInfos || []) {
      const existing = extractedLicenses.get(extractedLicensingInfo.licenseId);
      if (existing === undefined) {
        extractedLicenses.set(extractedLicensingInfo.licenseId, extractedLicensingInfo.extractedText);
        imageDocument.hasExtractedLicensingInfos.push(extractedLicensingInfo);
      } else if (existing !== extractedLicensingInfo.extractedText) {
        throw new Error(`Conflicting extractedText for licenseId ${extractedLicensingInfo.licenseId}`);
      }
    }
  }
}

function copyNeededSources(imageDocument, srcDir, destDir) {
  const pkgs = new Map();
  const deps = new Map();
  const sources = new Map();

  for (const pkg of imageDocument.packages) {
    pkgs.set(pkg.SPDXID, pkg);
  }

  const addDep = (pkg, dep) => {
    let pkgDeps = deps.get(pkg);

    if (!pkgDeps) {
      pkgDeps = [];
      deps.set(pkg, pkgDeps);
    }

    pkgDeps.push(dep);
  }

  for (const rel of imageDocument.relationships) {
    switch (rel.relationshipType) {
      case 'CONTAINS':
        addDep(rel.spdxElementId, rel.relatedSpdxElement);
        break;
      case 'RUNTIME_DEPENDENCY_OF':
        addDep(rel.relatedSpdxElement, rel.spdxElementId);
        break;
      case 'GENERATED_FROM':
        sources.set(rel.spdxElementId, rel.relatedSpdxElement);
        break;
    }
  }

  const imagePackage = imageDocument.packages[0];
  const imageSourcePackages = new Set();
  const visitedPackages = new Set();

  const visitQueue = [imagePackage.SPDXID];
  while (visitQueue.length) {
    const spdxid = visitQueue.pop();
    if (visitedPackages.has(spdxid)) {
      continue;
    }
    visitedPackages.add(spdxid);
    const sourcePackageSpdxid = sources.get(spdxid);
    if (sourcePackageSpdxid) {
      if (config.verbose) {
        console.log(`installed package: ${pkgs.get(spdxid)?.name ?? spdxid} ` +
          `(${pkgs.get(sourcePackageSpdxid)?.name ?? sourcePackageSpdxid})`);
      }
      imageSourcePackages.add(pkgs.get(sourcePackageSpdxid));
    }
    for (const dep of deps.get(spdxid) ?? []) {
      visitQueue.push(dep);
    }
  }

  for (const sourcePkg of imageSourcePackages) {
    if (areSourcesNeeded(sourcePkg)) {
      if (!sourcePkg.packageFileName) {
        console.warn(`Missing source archive for ${sourcePkg.name} (${getLicense(sourcePkg)})`);
        continue;
      }
      const srcPath = path.join(srcDir, sourcePkg.packageFileName);
      if (!fs.existsSync(srcPath)) {
        throw new Error(`Missing source archive for ${sourcePkg.name} (${getLicense(sourcePkg)}): ${srcPath}`);
      }
      linkOrCopySync(srcPath, path.join(destDir, sourcePkg.packageFileName), true);
    }
  }
}

function syncSourcePackageReferences(imageDocument, documentDir, sourcePackagesDir) {
  const relDir = path.relative(documentDir, sourcePackagesDir);

  for (const pkg of imageDocument.packages) {
    if (pkg.packageFileName) {
      if (fs.existsSync(path.join(sourcePackagesDir, pkg.packageFileName))) {
        pkg.packageFileName = path.join(relDir, pkg.packageFileName);
      } else {
        delete pkg.packageFileName;
      }
    }
  }
}

function makeOptimizedSbom(params) {
  const { sbomBase, recipesDir, imageName, machine } = params;
  const sbomDir = path.join(sbomBase, 'sbom');

  const indexData = loadIndex(sbomDir);
  const imageDocumentPath = findImageDocumentPath(indexData, sbomDir, imageName, machine);
  const documentMap = makeDocumentMap(indexData);
  const imageDocument = readSpdxDocument(imageDocumentPath);

  if (!Array.isArray(imageDocument.packages) || imageDocument.packages.length === 0) {
    throw new Error(`Image SPDX document has no packages: ${imageDocumentPath}`);
  }

  inlineAndShrink(imageDocument, documentMap, sbomDir);
  copyNeededSources(imageDocument, recipesDir, sbomDir);
  syncSourcePackageReferences(imageDocument, sbomBase, sbomDir);

  fs.writeFileSync(path.join(sbomBase, 'image.spdx.json'), JSON.stringify(imageDocument, null, 2));
}

exports.makeOptimizedSbom = makeOptimizedSbom;
