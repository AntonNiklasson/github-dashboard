import type { DxItem } from "./DxMenu";

export function buildDxItems(): DxItem[] {
  return [
    {
      kind: "action",
      id: "show-onboarding",
      label: "Show onboarding screen",
      onSelect: () => {
        const url = new URL(window.location.href);
        url.searchParams.set("onboarding", "1");
        window.location.assign(url.toString());
      },
    },
  ];
}
