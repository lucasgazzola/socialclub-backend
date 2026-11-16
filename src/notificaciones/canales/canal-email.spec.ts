import { CanalEmail } from './canal-email';
import type { ProveedorEmail } from '../proveedores/proveedor-email';

/** DT-36 · CanalEmail: estrategia de email sobre el proveedor configurado. */
describe('DT-36 · CanalEmail', () => {
  const proveedor = { configurado: true, enviar: jest.fn() } as ProveedorEmail & {
    enviar: jest.Mock;
  };
  const canal = new CanalEmail(proveedor);

  it('está disponible si el proveedor está configurado', () => {
    expect(canal.disponible()).toBe(true);
    expect(new CanalEmail({ ...proveedor, configurado: false }).disponible()).toBe(false);
  });

  it('usa el email del destinatario, o ninguno si no tiene', () => {
    expect(canal.destinoDe({ usuarioId: 1, email: 'a@club.test' })).toBe('a@club.test');
    expect(canal.destinoDe({ usuarioId: 1, email: '' })).toBeNull();
  });

  it('delega el envío en el proveedor', async () => {
    const contenido = { asunto: 'A', html: '<p>B</p>', texto: 'B' };
    await canal.enviar('a@club.test', contenido);
    expect(proveedor.enviar).toHaveBeenCalledWith('a@club.test', contenido);
  });
});
