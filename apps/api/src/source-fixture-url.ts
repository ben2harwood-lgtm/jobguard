/** Source-inspection tests inspect the same TypeScript bytes when emitted under dist. */
export function sourceFixtureUrl(relative: string, testModuleUrl: string): URL {
  const sourceModule = new URL(testModuleUrl);
  sourceModule.pathname = sourceModule.pathname.replace(/\/apps\/api\/dist\//u, "/apps/api/src/");
  return new URL(relative, sourceModule);
}
