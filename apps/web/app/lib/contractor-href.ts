/** Keep opted-in links within the designed contractor screens. */
export function contractorHref(path: string, designed: boolean) {
  return designed ? `${path}?designed=1` : path;
}
