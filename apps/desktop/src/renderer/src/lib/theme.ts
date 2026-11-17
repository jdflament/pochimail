/** Follows the OS appearance: the `.dark` class mirrors `prefers-color-scheme` (Electron's nativeTheme is set to "system"). */
export const followSystemTheme = (): void => {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", query.matches);
  apply();
  query.addEventListener("change", apply);
};
