import { ComponentClass } from "./component.js";

export interface VirtualNode {
  nodeType: "component" | "element" | "text" | "comment";
  tag: string;
  text: string;
  attrs: Record<string, any>;
  children: VirtualNode[];
  componentClass?: ComponentClass;
}
