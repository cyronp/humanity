import { APP_NAME } from "./config.ts"

export const backdropColor = (dark: boolean): string => (dark ? "#030303" : "#ffffff")

export const splashUrl = (mark: string, dark: boolean): string =>
  `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><title>${APP_NAME}</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: ${backdropColor(dark)}; app-region: drag; }
  svg { width: 64px; height: 64px; }
</style>
<body>${mark}</body>`,
  )}`
