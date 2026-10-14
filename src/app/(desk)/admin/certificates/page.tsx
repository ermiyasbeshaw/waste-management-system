import { getAdminCertificates } from "@/server/queries/admin";
import { CertificatesAdmin } from "@/components/admin/certificates-admin";

/** /admin/certificates — every certificate; revoke / reissue; failed generation and retry (super_admin). */
export default async function AdminCertificatesPage() {
  return <CertificatesAdmin rows={await getAdminCertificates()} />;
}
