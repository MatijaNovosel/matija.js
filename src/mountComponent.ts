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

export function createElementFactory(
  includes: Map<string, ComponentClass>
): CreateElement {
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
      // First argument is a component class
      nodeType = "component";
      tag = "";
      componentClass = type;
    } else if (includes.has(type)) {
      // First argument is the name of a component in the includes map
      nodeType = "component";
      tag = "";
      componentClass = includes.get(type);
    } else {
      // First argument is a regular element tag
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

    vNode.children = children.map((child) => {
      if (isVNode(child)) {
        return child;
      } else {
        return {
          nodeType: "text",
          tag: "",
          text: child,
          attrs: {},
          children: []
        };
      }
    });

    return vNode;
  };
}

function isVNode(child: unknown): child is VirtualNode {
  return child != null && (child as VirtualNode).nodeType !== undefined;
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

export function mountComponent(
  ComponentClass: ComponentClass,
  element: Element,
  props: Record<string, any>,
  children: VirtualNode[],
  vOldNode: VirtualNode
): Element {
  let component = new ComponentClass(props);

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
      throw new Error("Patch function did not return an element");
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

    // If one node is text and the texts don't match or one is not text
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
        // Component is replacing non-component or replacing different component
        return (node) =>
          this.domUpdater.mountComponentOnNode(node, vOldNode, vNewNode);
      } else {
        // Same component already exists here so update props
        const props = vNewNode.attrs;
        props.children = vNewNode.children;
        // return (node) => this.domUpdater.setComponentPropsOnNode(node, props);
      }
    }

    if (vOldNode.tag !== vNewNode.tag) {
      // New node is not component

      return (node) => {
        if (vOldNode.nodeType === "component") {
          // Non-component is replacing component so unmount old component
          this.domUpdater.unmountComponentOnNode(node);
        }
        return this.domUpdater.replaceNode(node, vNewNode);
      };
    }

    let patchAttrs = this.diffAttributes(vOldNode.attrs, vNewNode.attrs);
    const patchChildren = this.diffChildren(
      vOldNode.children,
      vNewNode.children
    );

    return (node) => {
      patchAttrs(node);
      patchChildren(node);
      return node;
    };
  }

  private diffAttributes(
    vOldAttrs: Record<string, any>,
    vNewAttrs: Record<string, any>
  ): PatchFunction {
    let patches: PatchFunction[] = [];

    // set new attributes
    for (const [vNewAttrName, vNewAttrValue] of Object.entries(vNewAttrs)) {
      patches.push((node) => {
        this.domUpdater.setAttribute(node, vNewAttrName, vNewAttrValue);
        return node;
      });
    }

    // remove old attributes
    for (const vOldAttrName in vOldAttrs) {
      // If an old attribute doesn't exist in the new vNode
      // OR the old attribute is now undefined or null, remove it
      if (!(vOldAttrName in vNewAttrs) || vNewAttrs[vOldAttrName] == null) {
        patches.push((node) => {
          this.domUpdater.removeAttribute(node, vOldAttrName);
          return node;
        });
      }
    }

    return (node) => {
      for (const patch of patches) {
        patch(node);
      }
      return node;
    };
  }

  private diffChildren(
    vOldChildren: VirtualNode[] = [],
    vNewChildren: VirtualNode[] = []
  ): PatchFunction {
    const childPatches: PatchFunction[] = [];

    vOldChildren.forEach((vOldChild, i) => {
      childPatches.push(this.diffNodes(vOldChild, vNewChildren[i]));
    });

    const additionalPatches: PatchFunction[] = [];
    for (const additionalVChild of vNewChildren.slice(vOldChildren.length)) {
      additionalPatches.push((parent) =>
        this.domUpdater.appendChildNode(parent, additionalVChild)
      );
    }

    return (parent) => {
      if (childPatches.length !== parent.childNodes.length) {
        throw new Error(
          "Actual child nodes in DOM does not match number of child patches"
        );
      }

      let patchChildNodesPairs = zip(childPatches, parent.childNodes);
      for (const pair of patchChildNodesPairs) {
        const patch = pair.left;
        const child = pair.right;
        patch(child as Element);
      }

      for (const patch of additionalPatches) {
        patch(parent);
      }

      return parent;
    };
  }
}

export function updateComponent(component: Component): Component {
  let createElement = createElementFactory(component.includes);
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
