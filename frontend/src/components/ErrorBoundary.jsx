import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Tracewire crashed:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="splash">
        <div className="card error-card">
          <h2>Something went wrong</h2>
          <p className="muted">Reload the page to continue. Anything that was already saved is safe.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}