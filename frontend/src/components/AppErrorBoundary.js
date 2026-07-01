import React from "react";
import "./AppErrorBoundary.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, details) {
    console.error("Bazario interface error", error, details);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="app-error">
        <section>
          <p>Bazario recovery</p>
          <h1>Something interrupted this page.</h1>
          <span>Your account and order data are unchanged. Reload the interface to continue.</span>
          <button type="button" onClick={() => window.location.reload()}>
            Reload Bazario
          </button>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
