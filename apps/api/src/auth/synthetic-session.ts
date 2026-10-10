/** The environment argument comes from server configuration, never request data. */
export function syntheticSessionAllowed(value:string|undefined,environment:string|undefined):boolean {
  return environment === "synthetic_demo" && !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}
