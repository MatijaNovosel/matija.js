import { VirtualNode } from "./interfaces/virtualNode";
import { ComponentClass } from "./interfaces/component";

interface MountFunction {
  (
    ComponentClass: ComponentClass,
    node: Element,
    props: Record<string, any>,
    children: VirtualNode[],
    vOldNode: VirtualNode
  ): Element;
}

export class DOMUpdater {
  private mountComponent: MountFunction;

  constructor(mountComponent: MountFunction) {
    this.mountComponent = mountComponent;
  }

  removeNode(node: Element): void {
    node.remove();
  }

  createElementInBody(tagName: string): Element {
    let element = document.createElement(tagName);
    document.body.appendChild(element);
    return element;
  }
}
