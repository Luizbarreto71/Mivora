import { InstitutionalPage, institutionalMetadata } from "@/components/store/institutional-page";

export function generateMetadata() {
  return institutionalMetadata("sobre", "Sobre a MIVORA");
}

export default function Page() {
  return <InstitutionalPage slug="sobre" />;
}
