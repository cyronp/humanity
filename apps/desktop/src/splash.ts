/** The web app's `--sidebar` in each theme: what the window shows before the app does. */
export const backdropColor = (dark: boolean): string => (dark ? "#0a0a0a" : "#ffffff")

/**
 * What the window shows while the daemon starts: nothing but the brand mark,
 * centered on the sidebar's colour, like the web app's own loading state that
 * follows it. The whole page moves the window, which has no title bar yet.
 */
export const splashUrl = (mark: string, dark: boolean): string =>
  `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><title>Humanity</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: ${backdropColor(dark)}; app-region: drag; }
  svg { width: 96px; height: 96px; }
</style>
<body>${mark}</body>`,
  )}`
