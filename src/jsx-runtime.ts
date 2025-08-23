export const CommentComponentName = 'comment';
declare global {
  namespace JSX {
    // type IntrinsicElements = Record<
    //   keyof HTMLElementTagNameMap | keyof SVGElementTagNameMap,
    //   Record<string, any>
    // > & {
    //   [CommentComponentName]: {
    //     text: string;
    //   };
    //   webview: Record<string, any>;
    // };
    /** JSX 表达式的返回类型（用于赋给 appendChild） */
    type Element = Node;

    /** 类组件实例需要满足的接口 */
    interface ElementClass {
      render: (...args: any[]) => any;
    }

    /** 告诉 TS：类组件的 props 来源于实例上的哪个属性名 */
    interface ElementAttributesProperty {
      props: {}; // 使用 this.props 作为属性来源
    }

    /** children 属性名 */
    interface ElementChildrenAttribute {
      children: {};
    }

    /** 内置标签（加上 webview） */
    interface IntrinsicElements
      extends Record<keyof HTMLElementTagNameMap, any>,
        Record<keyof SVGElementTagNameMap, any> {
      webview: any; // Electron 的 <webview>
      [CommentComponentName]: {
        text: string;
      };
    }
  }
}
export type BaseProps = Record<string, any>;
export type ComponentFunction = (props: BaseProps) => any;
export abstract class AbstractComponent<P extends BaseProps = BaseProps> {
  public props: P;
  public constructor(props: P) {
    this.props = props;
  }
  public abstract render() : any;
}
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const svgTags = new Set([
  "svg","g","path","rect","circle","ellipse","line","polyline","polygon",
  "text","tspan","textPath","defs","clipPath","mask","linearGradient","radialGradient",
  "stop","pattern","symbol","use","image","marker","filter","feGaussianBlur",
  "feOffset","feBlend","feColorMatrix","feComposite","feMerge","feMergeNode",
  "feMorphology","feTurbulence","foreignObject"
]);

function createElem(tag: string) {
  return svgTags.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
}

function setAttr(el: Element, key: string, value: any) {
  if (key === "children") return;
  if (key === "className" || key === "class") {
    el.setAttribute("class", value);
    return;
  }
  // 事件
  if (key.startsWith("on") && typeof value === "function") {
    (el as HTMLElement | SVGElement).addEventListener(key.slice(2).toLowerCase(), value);
    return;
  }
  // xlink/href
  if (key === "xlink:href") {
    el.setAttributeNS(XLINK_NS, "xlink:href", value);
    return;
  }

  const attr = key;
  el.setAttribute(attr, String(value));
}


export const jsx = {
  component(
    component: string | ComponentFunction | AbstractComponent,
    props: Record<string, any> | null,
    ...children: any[]
  ) {
    if (!props) props = {};
    props.children = children.flat(Infinity);
    if (component === CommentComponentName) {
      return document.createComment(props.text || "");
    }
    // class component
    if (typeof component === "function" && component.prototype instanceof AbstractComponent) {
      const CompClass = component as unknown as new (props: Record<string, any>) => AbstractComponent;
      const instance = new CompClass(props);
      return instance.render();
    }

    if (typeof component === "function") return component(props);
    const tag = component as string;
    const element = createElem(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "children") continue;
      else if (key === "className") element.setAttribute("class", value);
      else setAttr(element, key, value);
    }

    element.append(...props.children);

    return element;
  },
};
