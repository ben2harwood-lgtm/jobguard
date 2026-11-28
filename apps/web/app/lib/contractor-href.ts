/** Keep opted-in links within the designed work and approval screens. */
export function contractorHref(path: string, designed: boolean) {
  return designed ? `${path}?designed=1` : path;
}
