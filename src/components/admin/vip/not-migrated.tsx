import { AdminPage, Card } from "@/components/admin/ui";

/** The tables come with migration 024; until it reaches the database the area explains instead of failing. */
export function missingTables(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || /vip_/.test(error.message ?? "")));
}

export function NotMigrated() {
  return (
    <AdminPage title="Comunidade VIP">
      <Card>
        <p className="text-sm">O banco de dados ainda não recebeu a atualização da Comunidade VIP. Assim que ela for aplicada, esta área passa a funcionar.</p>
      </Card>
    </AdminPage>
  );
}
