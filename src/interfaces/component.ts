export abstract class NazarComponent {
  content?: string;
}

export interface Component {
  [state: string]: any;
}

export interface RenderComponent extends Component {
  render: () => void;
}
