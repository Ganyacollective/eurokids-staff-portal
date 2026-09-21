export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try { return await next(specifier + ".ts", context); } catch { /* fall through */ }
  }
  return next(specifier, context);
}
