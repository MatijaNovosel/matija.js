interface IMount {
  (element?: Element): void;
}

export interface INazar {
  mount: IMount;
}
