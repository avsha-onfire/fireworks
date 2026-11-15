/*
 * Cross-component request to open the settings panel on a given tab.
 *
 * The control panel is owned by the sidebar, which is mounted far away from
 * the places that want to open it (the home-screen nudge, onboarding), so the
 * request travels as a DOM event instead of through props.
 */

export const OPEN_SETTINGS_EVENT = 'gtm:open-settings';

export interface OpenSettingsDetail {
  /** A settings tab id, for example `gtm-workspace`. */
  tab: string;
}

export function requestOpenSettings(tab: string) {
  if (typeof document === 'undefined') {
    return;
  }

  document.dispatchEvent(new CustomEvent<OpenSettingsDetail>(OPEN_SETTINGS_EVENT, { detail: { tab } }));
}
