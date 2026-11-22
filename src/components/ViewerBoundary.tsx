import { Component, type ReactNode } from 'react'

/** Let the stage remount the renderer while the lab keeps its current pose. */
export class ViewerBoundary extends Component<
  { children: ReactNode; onUnavailable: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onUnavailable()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
