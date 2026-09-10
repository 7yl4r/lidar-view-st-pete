/**
 * A renderer-agnostic handle for one toggleable scene layer. Phase 1 grows this
 * (opacity, style, time binding); Phase 0 only needs visibility.
 */
export interface LayerHandle {
  id: string;
  label: string;
  setVisible: (visible: boolean) => void;
}
