// Lets a plain node script import the app's TypeScript modules: extensionless
// relative imports, and the "@/..." alias Next.js resolves to src/.
import { pathToFileURL } from "node:url";
import path from "node:path";

const SRC = pathToFileURL(path.join(process.cwd(), "src") + "/").href;

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const target = new URL(specifier.slice(2), SRC).href;
    for (const candidate of [target + ".ts", target + ".tsx", target]) {
      try { return await next(candidate, context); } catch { /* try the next */ }
    }
  }
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try { return await next(specifier + ".ts", context); } catch { /* fall through */ }
  }
  return next(specifier, context);
}
