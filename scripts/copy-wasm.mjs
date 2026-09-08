/**
 * Copies the MediaPipe WASM runtime into public/ after install.
 *
 * These files are not committed: they must match the installed
 * @mediapipe/tasks-vision version exactly, and taking them straight from
 * node_modules is the only way to guarantee that.
 */
import { cp, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/@mediapipe/tasks-vision/wasm");
const dest = resolve(root, "public/mediapipe/wasm");

try {
  const files = await readdir(src);
  await mkdir(dest, { recursive: true });
  for (const file of files) {
    await cp(resolve(src, file), resolve(dest, file));
  }
  console.log(`[mediapipe] wasm 런타임 ${files.length}개를 public/mediapipe/wasm 에 복사했습니다.`);
} catch (err) {
  // Never fail the install over this — the app reports a clear error if the
  // runtime is missing, and a partial install shouldn't look like a crash.
  console.warn(
    `[mediapipe] wasm 복사를 건너뜁니다: ${err.message}\n` +
      `  npm install 후 'node scripts/copy-wasm.mjs' 를 직접 실행하세요.`,
  );
}
