import React from 'react';
import ReactDOM from 'react-dom/client';
import { APP_NAME } from '@my-play-game/shared';

function App(): JSX.Element {
  return <main>{APP_NAME}</main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
