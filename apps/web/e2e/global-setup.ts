// Corre antes que todo (sin navegador): garantiza que el usuario e2e exista.
// El trigger fn_on_auth_user_created siembra su plantilla de config al crearlo.
import { asegurarUsuarioE2e } from './helpers/db';

export default async function globalSetup(): Promise<void> {
  await asegurarUsuarioE2e();
}
