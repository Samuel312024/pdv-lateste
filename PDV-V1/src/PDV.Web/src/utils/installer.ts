function resolveApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_URL ?? '/api';
  return configuredBaseUrl.endsWith('/') ? configuredBaseUrl.slice(0, -1) : configuredBaseUrl;
}

export function getPdvInstallerDownloadUrl() {
  return `${resolveApiBaseUrl()}/instalador/pdv/download`;
}

export function getPdvInstallerDownloadUrlAbsolute() {
  return new URL(getPdvInstallerDownloadUrl(), window.location.origin).toString();
}
