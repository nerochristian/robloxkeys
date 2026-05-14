import React from 'react';

type GradientInstance = {
  initGradient: (selector: string) => GradientController;
};

type GradientController = {
  disconnect?: () => void;
};

declare global {
  interface Window {
    Gradient?: new () => GradientInstance;
  }
}

const SCRIPT_ID = 'expresskeys-gradient-script';
const SCRIPT_SRC = '/expresskeys/gradient.js';

const loadGradientScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (window.Gradient) {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load expresskeys gradient script.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load expresskeys gradient script.'));
    document.head.appendChild(script);
  });

export const ExpressGradientBackground: React.FC = () => {
  const canvasId = React.useId().replace(/:/g, '');

  React.useEffect(() => {
    const selector = `#${canvasId}`;
    let disposed = false;
    let controller: GradientController | null = null;

    loadGradientScript()
      .then(() => {
        if (disposed || !window.Gradient) return;
        controller = new window.Gradient().initGradient(selector);
      })
      .catch((error) => {
        console.error('Failed to initialize express gradient background.', error);
      });

    return () => {
      disposed = true;
      controller?.disconnect?.();
    };
  }, [canvasId]);

  return (
    <div className="express-gradient-shell" aria-hidden="true">
      <canvas id={canvasId} className="express-gradient-canvas" />
      <div className="express-gradient-vignette" />
    </div>
  );
};
