#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [, , inputPath, outputPath, displayName = "Rocketbox Avatar"] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/wrap_humanoid_vrm.mjs input.glb output.vrm [name]");
  process.exit(1);
}

const source = fs.readFileSync(inputPath);
if (source.toString("ascii", 0, 4) !== "glTF" || source.readUInt32LE(4) !== 2) {
  throw new Error(`${inputPath} is not a glTF 2.0 binary file`);
}

const jsonLength = source.readUInt32LE(12);
const jsonType = source.readUInt32LE(16);
if (jsonType !== 0x4e4f534a) throw new Error("The first GLB chunk must be JSON");

const jsonStart = 20;
const jsonEnd = jsonStart + jsonLength;
const json = JSON.parse(source.subarray(jsonStart, jsonEnd).toString("utf8").trimEnd());
const nodeByName = new Map((json.nodes ?? []).map((node, index) => [node.name, index]));

const humanNode = (name) => {
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
      authors: ["Microsoft Rocketbox", "VRM conversion for Avatar Studio"],
      copyrightInformation: "Microsoft Rocketbox — MIT License",
      contactInformation: "https://github.com/microsoft/Microsoft-Rocketbox",
      references: [
        "https://github.com/microsoft/Microsoft-Rocketbox",
        "https://github.com/jihwan8784/----",
      ],
      licenseUrl: "https://github.com/microsoft/Microsoft-Rocketbox/blob/master/LICENSE.md",
      avatarPermission: "everyone",
      allowExcessivelyViolentUsage: false,
      allowExcessivelySexualUsage: false,
      commercialUsage: "corporation",
      allowPoliticalOrReligiousUsage: false,
      allowAntisocialOrHateUsage: false,
      creditNotation: "required",
      allowRedistribution: true,
      modification: "allowModificationRedistribution",
      otherLicenseUrl: "https://github.com/microsoft/Microsoft-Rocketbox/blob/master/LICENSE.md",
    },
    humanoid: {
      humanBones: {
        hips: humanNode("Hips"),
        spine: humanNode("Spine"),
        chest: humanNode("Chest"),
        neck: humanNode("Neck"),
        head: humanNode("Head"),
        leftShoulder: humanNode("LeftShoulder"),
        leftUpperArm: humanNode("LeftUpperArm"),
        leftLowerArm: humanNode("LeftForearm"),
        leftHand: humanNode("LeftHand"),
        rightShoulder: humanNode("RightShoulder"),
        rightUpperArm: humanNode("RightUpperArm"),
        rightLowerArm: humanNode("RightForearm"),
        rightHand: humanNode("RightHand"),
        leftUpperLeg: humanNode("LeftThigh"),
        leftLowerLeg: humanNode("LeftShin"),
        leftFoot: humanNode("LeftFoot"),
        rightUpperLeg: humanNode("RightThigh"),
        rightLowerLeg: humanNode("RightShin"),
        rightFoot: humanNode("RightFoot"),
      },
    },
  },
};

const jsonBytes = Buffer.from(JSON.stringify(json));
const paddedJsonLength = Math.ceil(jsonBytes.length / 4) * 4;
const jsonChunk = Buffer.alloc(paddedJsonLength, 0x20);
jsonBytes.copy(jsonChunk);

const rest = source.subarray(jsonEnd);
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
