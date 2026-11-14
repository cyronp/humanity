/** The build inlines an imported SVG file as its text. */
declare module "*.svg" {
  const text: string
  export default text
}
