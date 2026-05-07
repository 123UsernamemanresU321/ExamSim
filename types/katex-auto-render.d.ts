declare module "katex/dist/contrib/auto-render" {
  import { RenderMathInElementOptions } from "katex";
  function renderMathInElement(
    element: HTMLElement | DocumentFragment,
    options?: RenderMathInElementOptions
  ): void;
  export default renderMathInElement;
}
