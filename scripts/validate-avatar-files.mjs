#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredBones = new Set([
  "hips", "spine", "chest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot",
  "rightUpperLeg", "rightLowerLeg", "rightFoot",
]);

function readVrm(file) {
  const data = fs.readFileSync(file);
  if (data.toString("ascii", 0, 4) !== "glTF") throw new Error(`${file}: not a binary glTF/VRM file`);
  if (data.readUInt32LE(4) !== 2) throw new Error(`${file}: expected glTF 2.0`);
  const jsonLength = data.readUInt32LE(12);
  if (data.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${file}: first chunk is not JSON`);
  return { data, json: JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8").trimEnd()) };
}

function humanoidBoneNames(json, relative) {
  const vrm1 = json.extensions?.VRMC_vrm;
  if (vrm1) return { version: "1.0", names: new Set(Object.keys(vrm1.humanoid?.humanBones ?? {})) };
  const vrm0 = json.extensions?.VRM;
  if (vrm0) return {
    version: "0.x",
    names: new Set((vrm0.humanoid?.humanBones ?? []).map((entry) => entry?.bone).filter(Boolean)),
  };
  throw new Error(`${relative}: missing VRMC_vrm/VRM extension`);
}

function validateHumanoid(url, requireMorphs) {
  const file = path.join(root, "public", url.replace(/^\//, ""));
  if (!fs.existsSync(file)) throw new Error(`${url}: missing file`);
  const { data, json } = readVrm(file);
  const humanoid = humanoidBoneNames(json, url);
  const missing = [...requiredBones].filter((bone) => !humanoid.names.has(bone));
  if (missing.length) throw new Error(`${url}: missing humanoid bones: ${missing.join(", ")}`);
  if (!json.skins?.length) throw new Error(`${url}: no skin`);
  if (!json.materials?.length) throw new Error(`${url}: no materials`);
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  if (!primitives.length) throw new Error(`${url}: no mesh primitives`);
  if (!primitives.some((p) => p.attributes?.JOINTS_0 !== undefined && p.attributes?.WEIGHTS_0 !== undefined)) {
    throw new Error(`${url}: no JOINTS_0/WEIGHTS_0`);
  }
  const morphCount = primitives.reduce((sum, p) => sum + (p.targets?.length ?? 0), 0);
  if (requireMorphs && morphCount === 0) throw new Error(`${url}: expected facial morph targets but found none`);
  console.log(`OK ${url} (VRM ${humanoid.version}, ${(data.length / 1024 / 1024).toFixed(2)} MB, morphTargets=${morphCount})`);
}

const source = fs.readFileSync(path.join(root, "src/AvatarStudio.tsx"), "utf8");
const urls = [...new Set([...source.matchAll(/\/avatars\/(?:valid|rocketbox)-[a-z-]+\.vrm/g)].map((m) => m[0]))];
if (urls.length < 10) throw new Error(`Expected catalog VRM references, found only ${urls.length}`);

for (const line of source.split(/\r?\n/)) {
  if (!line.includes('url: "/avatars/')) continue;
  if (line.includes('source: "valid"') && !line.includes('/avatars/valid-')) throw new Error(`VALID source mismatch: ${line.trim()}`);
  if (line.includes('source: "rocketbox"') && !line.includes('/avatars/rocketbox-')) throw new Error(`Rocketbox source mismatch: ${line.trim()}`);
}

for (const url of urls) validateHumanoid(url, url.startsWith("/avatars/valid-"));

for (const notice of ["public/avatars/LICENSE_GOOGLE_VALID.md", "public/avatars/LICENSE_MICROSOFT_ROCKETBOX.md"]) {
  if (!fs.existsSync(path.join(root, notice))) throw new Error(`Missing license notice: ${notice}`);
}

console.log(`Validated ${urls.length} catalog VRM references.`);
