export abstract class UserCreatedComponent {
  content?: string;
}

export interface FoundationComponent {
  [state: string]: any;
}

export interface RenderComponent extends FoundationComponent {
  render: () => void;
}

export interface TemplateComponent extends FoundationComponent {
  template: string;
  includes?: Record<string, any>;
}

export type Component = RenderComponent | TemplateComponent;

export interface ComponentClass {
  new (props: any): Component;
}
