import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const coreDir = path.join(root, "src/core");
const coreFiles = [
  "types.ts",
  "avatar-rig.ts",
  "tracking-smoothing.ts",
  "tracking-landmarks.ts",
  "tracking-overlay.ts",
  "face-expressions.ts",
  "motion-solver.ts",
  "vrm-loader.ts",
  "tracking-engine.ts",
  "scene-viewer.ts",
  "settings.ts",
].map((name) => path.join(coreDir, name));

for (const file of coreFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing core source: ${path.relative(root, file)}`);
}

const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
if (!configPath) throw new Error("tsconfig.json not found");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const program = ts.createProgram({ rootNames: coreFiles, options: parsedConfig.options });
const checker = program.getTypeChecker();

const prefixFor = (fileName) =>
  path.basename(fileName, ".ts").replace(/[^A-Za-z0-9]+(.)/g, (_, c) => c.toUpperCase()).replace(/[^A-Za-z0-9_$]/g, "") + "__";

function isExported(node) {
  return Boolean(node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function bindingIdentifiers(name, out = []) {
  if (ts.isIdentifier(name)) out.push(name);
  else for (const element of name.elements ?? []) bindingIdentifiers(element.name, out);
  return out;
}

const renameBySymbol = new Map();
const exportedNames = new Map();

for (const fileName of coreFiles) {
  const sf = program.getSourceFile(fileName);
  if (!sf) throw new Error(`TypeScript could not load ${fileName}`);
  const prefix = prefixFor(fileName);

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      const internal = spec.startsWith("./") || spec.startsWith("@/core/") || spec === "@/core";
      const clause = stmt.importClause;
      if (!clause) continue;

      if (internal) {
        if (clause.name) throw new Error(`Internal default import is not supported while merging: ${sf.fileName}`);
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
          throw new Error(`Internal namespace import is not supported while merging: ${sf.fileName}`);
        }
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if (element.propertyName && element.propertyName.text !== element.name.text) {
              const symbol = checker.getSymbolAtLocation(element.name);
              if (symbol) renameBySymbol.set(symbol, element.propertyName.text);
            }
          }
        }
      } else {
        const imported = [];
        if (clause.name) imported.push(clause.name);
        if (clause.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) imported.push(clause.namedBindings.name);
          else for (const element of clause.namedBindings.elements) imported.push(element.name);
        }
        for (const id of imported) {
          const symbol = checker.getSymbolAtLocation(id);
          if (symbol) renameBySymbol.set(symbol, `${prefix}${id.text}`);
        }
      }
      continue;
    }

    const recordExport = (nameNode) => {
      if (!nameNode || !ts.isIdentifier(nameNode)) return;
      const prev = exportedNames.get(nameNode.text);
      if (prev && prev !== sf.fileName) {
        throw new Error(`Duplicate exported core name ${nameNode.text}: ${prev} and ${sf.fileName}`);
      }
      exportedNames.set(nameNode.text, sf.fileName);
    };

    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        const ids = bindingIdentifiers(decl.name);
        if (isExported(stmt)) ids.forEach(recordExport);
        else {
          for (const id of ids) {
            const symbol = checker.getSymbolAtLocation(id);
            if (symbol) renameBySymbol.set(symbol, `${prefix}${id.text}`);
          }
        }
      }
      continue;
    }

    if (
      ts.isFunctionDeclaration(stmt) ||
      ts.isClassDeclaration(stmt) ||
      ts.isInterfaceDeclaration(stmt) ||
      ts.isTypeAliasDeclaration(stmt) ||
      ts.isEnumDeclaration(stmt)
    ) {
      if (!stmt.name) continue;
      if (isExported(stmt)) recordExport(stmt.name);
      else {
        const symbol = checker.getSymbolAtLocation(stmt.name);
        if (symbol) renameBySymbol.set(symbol, `${prefix}${stmt.name.text}`);
      }
    }
  }
}

const replacementsByFile = new Map(coreFiles.map((f) => [f, []]));
for (const fileName of coreFiles) {
  const sf = program.getSourceFile(fileName);
  const replacements = replacementsByFile.get(fileName);
  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      const next = symbol ? renameBySymbol.get(symbol) : null;
      if (next && next !== node.text) replacements.push({ start: node.getStart(sf), end: node.end, text: next });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function applyReplacements(text, replacements) {
  const unique = new Map();
  for (const edit of replacements) unique.set(`${edit.start}:${edit.end}`, edit);
  const edits = [...unique.values()].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = text;
  let lastStart = Infinity;
  for (const edit of edits) {
    if (edit.end > lastStart) throw new Error(`Overlapping rename edit at ${edit.start}:${edit.end}`);
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    lastStart = edit.start;
  }
  return out;
}

function splitModule(text, fileName) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = [];
  const remove = [];
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const spec = stmt.moduleSpecifier.text;
      const internal = spec.startsWith("./") || spec.startsWith("@/core/") || spec === "@/core";
      if (!internal) imports.push(text.slice(stmt.getStart(sf), stmt.end));
      remove.push({ start: stmt.getFullStart(), end: stmt.end });
    } else if (
      ts.isExpressionStatement(stmt) &&
      ts.isStringLiteral(stmt.expression) &&
      stmt.expression.text === "use client"
    ) {
      remove.push({ start: stmt.getFullStart(), end: stmt.end });
    }
  }
  let body = text;
  for (const range of remove.sort((a, b) => b.start - a.start)) {
    body = body.slice(0, range.start) + body.slice(range.end);
  }
  return { imports, body: body.trim() };
}

const externalImports = [];
const sections = [];
for (const fileName of coreFiles) {
  const original = fs.readFileSync(fileName, "utf8");
  const renamed = applyReplacements(original, replacementsByFile.get(fileName));
  const { imports, body } = splitModule(renamed, fileName);
  externalImports.push(...imports);
  sections.push(`// -----------------------------------------------------------------------------\n// ${path.basename(fileName)}\n// -----------------------------------------------------------------------------\n${body}`);
}

const merged = [
  '"use client";',
  "",
  ...externalImports,
  "",
  "// Consolidated Avatar Studio core. Keep domain sections separated by comments",
  "// instead of splitting them back into nested TypeScript folders.",
  "",
  ...sections,
  "",
].join("\n");

fs.writeFileSync(path.join(root, "src/core.ts"), merged);
fs.rmSync(coreDir, { recursive: true, force: true });

function stripImports(text, predicate) {
  const sf = ts.createSourceFile("tmp.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const ranges = [];
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && predicate(stmt.moduleSpecifier.text)) {
      ranges.push({ start: stmt.getFullStart(), end: stmt.end });
    }
  }
  let out = text;
  for (const range of ranges.sort((a, b) => b.start - a.start)) out = out.slice(0, range.start) + out.slice(range.end);
  return out;
}

const studioPath = path.join(root, "src/AvatarStudio.tsx");
let studio = fs.readFileSync(studioPath, "utf8");
studio = studio.replace(/@\/core\/(?:avatar-rig|face-expressions|motion-solver|scene-viewer|settings|tracking-engine|tracking-landmarks|tracking-overlay|tracking-smoothing|types|vrm-loader)/g, "@/core");
fs.writeFileSync(studioPath, studio);

for (const page of ["src/app/page.tsx", "src/app/embed/page.tsx"]) {
  const file = path.join(root, page);
  if (!fs.existsSync(file)) continue;
  let text = fs.readFileSync(file, "utf8");
  text = text.replace(/@\/core\/[A-Za-z0-9-]+/g, "@/core");
  fs.writeFileSync(file, text);
}

const testPath = path.join(root, "scripts/test-avatar-tracking.mts");
const mannequinPath = path.join(root, "scripts/test-mannequin.ts");
let test = fs.readFileSync(testPath, "utf8");
let mannequin = fs.readFileSync(mannequinPath, "utf8");
test = stripImports(test, (spec) => spec === "three" || spec === "./test-mannequin" || spec.startsWith("../src/core"));
mannequin = stripImports(mannequin, () => true);
const testImports = `import * as THREE from "three";\n\nimport {\n  FINGER_NAMES,\n  MIRROR_PAIRS,\n  PoseSolver,\n  fingerBone,\n  type AvatarRig,\n  type BoneName,\n  type ExpressionName,\n  type FingerName,\n  type JointName,\n  type Joints,\n  type RigMetrics,\n  type Side,\n  type TrackFrame,\n  type Vec3,\n} from "../src/core";\n`;
fs.writeFileSync(testPath, `${testImports}\n// Test-only humanoid fixture, kept in this test file to avoid another .ts source.\n${mannequin.trim()}\n\n${test.trim()}\n`);
fs.rmSync(mannequinPath, { force: true });

const nextTs = path.join(root, "next.config.ts");
if (fs.existsSync(nextTs)) fs.rmSync(nextTs);
fs.writeFileSync(path.join(root, "next.config.mjs"), 'const nextConfig = {\n  output: "export",\n};\n\nexport default nextConfig;\n');

const readmePath = path.join(root, "README.md");
let readme = fs.readFileSync(readmePath, "utf8");
readme = readme.replace(/\n## TypeScript 파일 구조[\s\S]*?(?=\n## |$)/, "");
readme += `\n\n## TypeScript 파일 구조\n\n앱의 일반 \`.ts\` 소스는 \`src/core.ts\` 하나로 통합했습니다. React 화면은 \`src/AvatarStudio.tsx\`와 Next.js의 \`src/app/*.tsx\`만 유지합니다. 추적, VRM 로더, 리그, 장면, 설정 코드는 모두 \`src/core.ts\` 안의 섹션으로 구분됩니다.\n`;
fs.writeFileSync(readmePath, readme);

const stalePatterns = [
  "@/core/avatar-rig",
  "@/core/face-expressions",
  "@/core/motion-solver",
  "@/core/scene-viewer",
  "@/core/settings",
  "@/core/tracking-engine",
  "@/core/tracking-landmarks",
  "@/core/tracking-overlay",
  "@/core/tracking-smoothing",
  "@/core/types",
  "@/core/vrm-loader",
  "../src/core/",
];
for (const file of [studioPath, testPath]) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of stalePatterns) {
    if (text.includes(pattern)) throw new Error(`${path.relative(root, file)} still contains stale import ${pattern}`);
  }
}

console.log("Merged core TypeScript into src/core.ts and removed standalone .ts helpers.");
