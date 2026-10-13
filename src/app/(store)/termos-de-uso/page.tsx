import { InstitutionalPage, institutionalMetadata } from "@/components/store/institutional-page";

export function generateMetadata() {
  return institutionalMetadata("termos-de-uso", "Termos de Uso");
}

export default function Page() {
  return <InstitutionalPage slug="termos-de-uso" />;
}
