import { readFileSync, readdirSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const networkModule =
  /^(?:@octokit(?:\/|$)|axios$|undici$|got$|node-fetch$|(?:node:)?(?:https?|net|tls)$)/;

export function violations(path, source) {
  const errors = [];
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const host = ts.createCompilerHost({ noLib: true, noResolve: true });
  host.getSourceFile = (name) => (name === path ? file : undefined);
  const checker = ts
    .createProgram([path], { noLib: true, noResolve: true }, host)
    .getTypeChecker();
  const webApi = path === "packages/web/src/api.ts";
  const desktop = path.startsWith("packages/desktop/");
  const report = (node, message) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    errors.push(`${path}:${line + 1}: ${message}`);
  };
  const moduleCheck = (node, name) => {
    if (
      networkModule.test(name) &&
      !(path === "packages/desktop/src/main.ts" && name === "node:net")
    )
      report(node, `GitHub/network clients belong in packages/sync: ${name}`);
    if (/sync[\\/]src[\\/]/.test(name) || name.startsWith("sync/"))
      report(node, "Use the public sync export, not its internals");
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      moduleCheck(node, node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(file);
      if (
        (name === "require" ||
          node.expression.kind === ts.SyntaxKind.ImportKeyword) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        moduleCheck(node, node.arguments[0].text);
      if (webApi && (name === "fetchJson" || name === "fetch")) {
        const arg = node.arguments[0];
        const text =
          arg &&
          (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)
            ? arg.text
            : ts.isTemplateExpression(arg)
              ? arg.head.text
              : null);
        if (
          !(
            text?.startsWith("/api/") ||
            (name === "fetch" && arg?.getText(file) === "url")
          )
        )
          report(node, "Renderer requests must use a relative /api/ URL");
      }
    }
    if (
      ts.isIdentifier(node) &&
      ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].includes(
        node.text,
      )
    ) {
      const parentNode = node.parent;
      if (
        (ts.isPropertyAssignment(parentNode) && parentNode.name === node) ||
        (ts.isPropertyAccessExpression(parentNode) &&
          parentNode.name === node &&
          !["globalThis", "window", "self"].includes(
            parentNode.expression.getText(file),
          ))
      )
        return;
      if (
        checker
          .getSymbolAtLocation(node)
          ?.declarations?.some(
            (declaration) =>
              ts.isVariableDeclaration(declaration) ||
              ts.isParameter(declaration) ||
              ts.isBindingElement(declaration),
          )
      )
        return;
      // The packaged app's only fetch is its loopback readiness probe.
      let parent = node.parent;
      while (parent && !ts.isFunctionDeclaration(parent))
        parent = parent.parent;
      const readiness = desktop && parent?.name?.text === "waitForServer";
      if (!webApi && !readiness)
        report(
          node,
          "Network access must go through sync (renderer transport belongs in api.ts)",
        );
    }
    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      ts.isStringLiteral(node.argumentExpression) &&
      ["fetch", "XMLHttpRequest", "WebSocket", "EventSource"].includes(
        node.argumentExpression.text,
      )
    )
      report(node, "Computed network access bypasses the sync boundary");
    ts.forEachChild(node, visit);
  };
  visit(file);
  return errors;
}

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "test-utils") yield* sourceFiles(path);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(?:test|spec)\./.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    )
      yield path;
  }
}

export function checkRepository() {
  const errors = [];
  for (const pkg of ["server", "web", "desktop", "cli"]) {
    for (const file of sourceFiles(resolve(root, "packages", pkg, "src")))
      errors.push(
        ...violations(
          relative(root, file).replaceAll("\\", "/"),
          readFileSync(file, "utf8"),
        ),
      );
    const manifest = JSON.parse(
      readFileSync(resolve(root, "packages", pkg, "package.json"), "utf8"),
    );
    for (const name of Object.keys(manifest.dependencies ?? {}))
      if (
        networkModule.test(name) &&
        !(path === "packages/desktop/src/main.ts" && name === "node:net")
      )
        errors.push(
          `packages/${pkg}/package.json: network dependency ${name} belongs in sync`,
        );
  }
  return errors;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = checkRepository();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("GitHub access boundaries passed");
}
