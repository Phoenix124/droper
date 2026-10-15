import type { DroperApi } from '../shared/api';

declare global {
  interface Window {
    droper: DroperApi;
  }
}
