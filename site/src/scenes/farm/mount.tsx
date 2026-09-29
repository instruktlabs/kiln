import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { FarmScene, type FarmSceneProps } from './FarmScene';

class SceneBoundary extends Component<
  { children: ReactNode; onError?: (e: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    queueMicrotask(() => this.props.onError?.(error));
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function mountFarmScene(element: HTMLElement, props: FarmSceneProps) {
  const root = createRoot(element);
  root.render(
    <SceneBoundary onError={props.onError}>
      <FarmScene {...props} />
    </SceneBoundary>,
  );
  return () => root.unmount();
}
