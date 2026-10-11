import { create } from 'zustand';

/** Estado de interfaz no persistente. */
export const useUiState = create<{ onboarding: boolean; updateReady: boolean; stickyActions: number }>(() => ({
  onboarding: false,
  updateReady: false,
  stickyActions: 0,
}));
