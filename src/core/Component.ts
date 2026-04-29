export interface Component {
  readonly type: string;
}

export type ComponentMap = Map<string, Component>;
