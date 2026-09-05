#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [, , inputPath, outputPath, displayName = "Project Human Avatar"] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/convert-project-glb-to-vrm.mjs input.glb output.vrm [name]");
  process.exit(1);
}

const source = fs.readFileSync(inputPath);

if (source.toString("ascii", 0, 4) !== "glTF" || source.readUInt32LE(4) !== 2) {
  throw new Error(`${inputPath} is not a glTF 2.0 binary file`);
}

const jsonLength = source.readUInt32LE(12);
const jsonType = source.readUInt32LE(16);
if (jsonType !== 0x4e4f534a) throw new Error("The first GLB chunk must be JSON");

const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString("utf8").trimEnd());
const nodeByName = new Map(json.nodes.map((node, index) => [node.name, index]));
const node = (name) => {
  const index = nodeByName.get(name);
  if (index === undefined) throw new Error(`Missing humanoid node: ${name}`);
  return { node: index };
};

json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), "VRMC_vrm"])];
json.extensions = {
  ...(json.extensions ?? {}),
  VRMC_vrm: {
    specVersion: "1.0",
    meta: {
      name: displayName,
      version: "1.0",
      authors: ["jihwan8784"],
      copyrightInformation: "Original project avatar asset by jihwan8784",
      contactInformation: "https://github.com/jihwan8784/project",
      references: ["https://github.com/jihwan8784/project"],
      licenseUrl: "https://vrm.dev/licenses/1.0/",
      avatarPermission: "everyone",
      allowExcessivelyViolentUsage: false,
      allowExcessivelySexualUsage: false,
      commercialUsage: "personalNonProfit",
      allowPoliticalOrReligiousUsage: false,
      allowAntisocialOrHateUsage: false,
      creditNotation: "required",
      allowRedistribution: false,
      modification: "allowModification",
      otherLicenseUrl: "https://github.com/jihwan8784/project",
    },
    humanoid: {
      humanBones: {
        hips: node("Hips"),
        spine: node("Spine"),
        chest: node("Chest"),
        neck: node("Neck"),
        head: node("Head"),
        leftShoulder: node("LeftShoulder"),
        leftUpperArm: node("LeftUpperArm"),
        leftLowerArm: node("LeftForearm"),
        leftHand: node("LeftHand"),
        rightShoulder: node("RightShoulder"),
        rightUpperArm: node("RightUpperArm"),
        rightLowerArm: node("RightForearm"),
        rightHand: node("RightHand"),
        leftUpperLeg: node("LeftThigh"),
        leftLowerLeg: node("LeftShin"),
        leftFoot: node("LeftFoot"),
        rightUpperLeg: node("RightThigh"),
        rightLowerLeg: node("RightShin"),
        rightFoot: node("RightFoot"),
      },
    },
  },
};

const jsonBytes = Buffer.from(JSON.stringify(json));
const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
const jsonChunk = Buffer.alloc(paddedJsonLength, 0x20);
jsonBytes.copy(jsonChunk);

const restOffset = 20 + jsonLength;
const rest = source.subarray(restOffset);
const output = Buffer.alloc(20 + jsonChunk.length + rest.length);

output.write("glTF", 0, "ascii");
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(jsonChunk.length, 12);
output.writeUInt32LE(0x4e4f534a, 16);
jsonChunk.copy(output, 20);
rest.copy(output, 20 + jsonChunk.length);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output);
console.log(`${path.basename(inputPath)} -> ${path.basename(outputPath)} (${output.length} bytes)`);
