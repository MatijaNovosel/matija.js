import { DOMUpdater, mapVNode } from "./domUpdater";
import { getMethodNames, isArray, isObject, zip } from "./helpers";
import { Component, ComponentClass } from "./interfaces/component";
import { VirtualNode } from "./interfaces/virtualNode";

interface NestedState {
  [state: string]: any;
  $component: ComponentProxy;
}

type ProxiedObject = NestedState | ComponentProxy;

const proxyHandler: ProxyHandler<ComponentProxy> = {
  get: handleGet,
  set: handleSet,
  deleteProperty: handleDelete
};

function handleGet(obj: ProxiedObject, prop: string): unknown {
  let val = obj[prop];

  if (isObject(val) || isArray(val)) {
    if (prop === "props" && !obj.$component) {
      return val;
    }

    if (prop.startsWith("$")) {
      return val;
    }

    val.$component = getComponent(obj);
    if (isArray(val)) {
      val.forEach((element: ProxiedObject) => {
        if (isObject(element)) {
          element.$component = getComponent(obj);
        }
      });
    }
    return new Proxy(val, proxyHandler);
  } else {
    return val;
  }
}

function handleSet(obj: ComponentProxy, prop: string, value: any): boolean {
  obj[prop] = value;
  let component = getComponent(obj);
  if (prop === "props") {
    component.$vnode.attrs = value;
  }
  component.$update();
  return true;
}

function handleDelete(obj: ComponentProxy, prop: string): boolean {
  delete obj[prop];
  let component = getComponent(obj);
  component.$update();
  return true;
}

function getComponent(obj: ProxiedObject): ComponentProxy {
  return obj.$component != null ? obj.$component : obj;
}

export type ComponentProxy = InjectedProps & Component;

interface NodeContext {
  eventHandlers: Record<string, EventListener>;
  component?: ComponentProxy;
}

type ElementWithNodeContext = Element & {
  _matijaJS?: NodeContext;
};

function getOrCreateNodeContext(node: ElementWithNodeContext): NodeContext {
  if (!node._matijaJS) {
    node._matijaJS = {
      eventHandlers: {}
    };
  }
  return node._matijaJS;
}

export function createComponentProxy(component: Component): ComponentProxy {
  return new Proxy(component, proxyHandler) as ComponentProxy;
}

export function setComponentProxy(
  node: ElementWithNodeContext,
  componentProxy: ComponentProxy
) {
  let nodeContext = getOrCreateNodeContext(node);
  nodeContext.component = componentProxy;
}

export interface CreateElement {
  (
    type: string | (new (props: any) => Component),
    props?: Record<string, any>,
    children?: (VirtualNode | string)[] | VirtualNode | string
  ): VirtualNode;
}

export interface Render {
  (createElement: CreateElement): VirtualNode;
}

export interface InjectedProps {
  props: Record<string, any>;
  $element: Element;
  $vnode: VirtualNode;
  includes: Map<string, ComponentClass>;
  render: Render;
  $update: (newData?: Record<string, any>) => void;
}

let domUpdater = new DOMUpdater(mountComponent);

export function createElementFactory(): CreateElement {
  return function (
    type: string | (new (props: any) => Component),
    props: Record<string, any> = {},
    children: (VirtualNode | string)[] | VirtualNode | string = []
  ): VirtualNode {
    if (!isArray(children)) {
      children = [children];
    }

    let nodeType: "component" | "element";
    let tag;
    let componentClass;

    if (typeof type == "function") {
      nodeType = "component";
      tag = "";
      componentClass = type;
    } else {
      nodeType = "element";
      tag = type;
    }

    let vNode: VirtualNode = {
      nodeType: nodeType,
      tag: tag,
      text: "",
      attrs: props,
      children: [],
      componentClass: componentClass
    };

    return vNode;
  };
}

function bindAllMethods(
  component: Component,
  componentProxy: ComponentProxy,
  ComponentClass: ComponentClass
) {
  getMethodNames(ComponentClass).forEach((method) => {
    component[method] = component[method].bind(componentProxy);
  });
}

export function htmlToDom(html: string): Element {
  let document = new DOMParser().parseFromString(html, "text/html");
  let wrapperNode = document.body;
  return wrapperNode.children[0];
}

const cache = new Map<string, string>();

function compileNode(vNode: VirtualNode): string {
  if (vNode.nodeType === "text") {
    let text = vNode.text.replace(/\n/g, "\\n");
    text = compileText(text);
    return text;
  } else {
    return compileElement(vNode);
  }
}

function compileElement(vNode: VirtualNode): string {
  let code = "h(";
  code += "'" + vNode.tag + "'";
  code += ")";
  return code;
}

function compileText(text: string) {
  if (text.length < 5) {
    return "'" + text + "'";
  }
  let inExpression = false;
  let expression = "";
  let output = "";
  if (text.charAt(0) !== "{" || text.charAt(1) !== "{") {
    output += "'";
  }
  let char, nextChar;
  for (let i = 0; i < text.length; i++) {
    char = text.charAt(i);
    nextChar = text.length > i ? text.charAt(i + 1) : false;
    if (char === "{" && nextChar && nextChar === "{") {
      if (i !== 0) {
        output += "'+";
      }
      output += "(";
      i++;
      inExpression = true;
    } else if (char === "}") {
      i++;
      output += expression + ")";
      inExpression = false;
      expression = "";
      if (i !== text.length - 1) {
        output += "+'";
      }
    } else if (inExpression) {
      expression += char;
    } else {
      output += char;
    }
  }
  if (char !== "'" && char !== "}") {
    output += "'";
  }
  return output;
}

export function compileTemplate(template: string): string {
  let cachedCode = cache.get(template);
  if (cachedCode) {
    return cachedCode;
  }
  let node = htmlToDom(template);
  let vNode = mapVNode(node, false);
  let code = "with(this){return " + compileNode(vNode) + "}";
  cache.set(template, code);
  return code;
}

export function mountComponent(
  ComponentClass: ComponentClass,
  element: Element,
  props: Record<string, any>,
  children: VirtualNode[],
  vOldNode: VirtualNode
): Element {
  let component = new ComponentClass(props);

  if (!component.render) {
    if (component.content) {
      let renderMethodCode = compileTemplate(component.content);
      component.render = new Function("h", renderMethodCode) as Render;
    } else {
      throw new Error();
    }
  }

  component.$element = element;
  component.$vnode = vOldNode;
  component.props = props;
  component.props.children = children;

  let componentProxy = createComponentProxy(component);

  component.$update = function (newData?: Record<string, any>) {
    if (newData && isObject(newData)) {
      Object.assign(component, newData);
    }
    updateComponent(component);
  };

  bindAllMethods(component, componentProxy, ComponentClass);
  updateComponent(component);
  setComponentProxy(component.$element, componentProxy);

  return component.$element;
}

export function getComponentProxy(
  node: ElementWithNodeContext
): ComponentProxy {
  let nodeContext = getOrCreateNodeContext(node);
  if (nodeContext.component) {
    return nodeContext.component;
  } else {
    throw new Error();
  }
}

export function mountFoundationComponent<T extends Component>(
  ComponentClass: new (props: any) => T,
  element?: Element,
  props: Record<string, any> = {}
): T & InjectedProps {
  if (!element) {
    element = domUpdater.createElementInBody("div");
  }
  let vOldNode = mapVNode(element);
  let newNode = mountComponent(
    ComponentClass as any,
    element,
    props,
    [],
    vOldNode
  );
  return getComponentProxy(newNode) as any;
}

interface PatchFunction {
  (node: Element): Element | void;
}

export class DiffEngine {
  private domUpdater: DOMUpdater;

  constructor(domUpdater: DOMUpdater) {
    this.domUpdater = domUpdater;
  }

  reconcile(
    element: Element,
    vOldNode: VirtualNode,
    vNewNode: VirtualNode
  ): Element {
    let patch = this.createPatchFunction(vOldNode, vNewNode);
    let newElement = patch(element);
    if (newElement) {
      return newElement;
    } else {
      throw new Error();
    }
  }

  createPatchFunction(
    vOldNode: VirtualNode,
    vNewNode: VirtualNode
  ): PatchFunction {
    return this.diffNodes(vOldNode, vNewNode);
  }

  private diffNodes(
    vOldNode: VirtualNode,
    vNewNode?: VirtualNode
  ): PatchFunction {
    if (!vNewNode) {
      return (node) => this.domUpdater.removeNode(node);
    }

    if (
      (vOldNode.nodeType === "text" || vNewNode.nodeType === "text") &&
      (vNewNode.text !== vOldNode.text ||
        vOldNode.nodeType !== "text" ||
        vNewNode.nodeType !== "text")
    ) {
      return (node) => this.domUpdater.replaceNode(node, vNewNode);
    }

    if (vNewNode.nodeType === "component") {
      if (vOldNode.componentClass !== vNewNode.componentClass) {
        return (node) =>
          this.domUpdater.mountComponentOnNode(node, vOldNode, vNewNode);
      } else {
        const props = vNewNode.attrs;
        props.children = vNewNode.children;
      }
    }

    if (vOldNode.tag !== vNewNode.tag) {
      return (node) => {
        if (vOldNode.nodeType === "component") {
          this.domUpdater.unmountComponentOnNode(node);
        }
        return this.domUpdater.replaceNode(node, vNewNode);
      };
    }

    return (node) => {
      return node;
    };
  }
}

export function updateComponent(component: Component): Component {
  let createElement = createElementFactory();
  let newVNode = component.render(createElement);

  let diffEngine = new DiffEngine(domUpdater);
  let newNode = diffEngine.reconcile(
    component.$element,
    component.$vnode,
    newVNode
  );

  component.$vnode = newVNode;
  component.$element = newNode;

  return component;
}
