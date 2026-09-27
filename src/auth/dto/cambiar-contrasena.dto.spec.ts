import { IsString, validate } from 'class-validator';
import { CambiarContrasenaDto } from './cambiar-contrasena.dto';
import { MatchesPassword } from './match-password.validator';

/**
 * Validación de contrato de US-41 (CambiarContrasenaDto) ejecutada directo sobre
 * class-validator, sin HTTP: es la misma instancia de ValidationPipe que aplica
 * main.ts. Cubre la política de complejidad (TC-120) y la coincidencia de la
 * confirmación (TC-121) tal como las ve el frontend antes de reintentar.
 */
describe('CambiarContrasenaDto (US-41)', () => {
  const validos = {
    passwordActual: 'Socio123!',
    nuevaContrasena: 'Nueva123!',
    confirmarNuevaContrasena: 'Nueva123!',
  };

  const dto = (props: Partial<typeof validos> = {}) =>
    Object.assign(new CambiarContrasenaDto(), validos, props);

  const mensajes = async (objeto: object): Promise<string[]> => {
    const errores = await validate(objeto);
    return errores.flatMap((e) => Object.values(e.constraints ?? {}));
  };

  it('acepta una nueva contraseña válida confirmada correctamente', async () => {
    await expect(mensajes(dto())).resolves.toEqual([]);
  });

  it.each([
    ['corton1!', 'sin mayúscula'],
    ['sinmayusculas1!', 'sin mayúscula'],
    ['SINMINUSCULAS1!', 'sin minúscula'],
    ['SinNumerosAA!', 'sin número'],
    ['SinEspecial1A', 'sin carácter especial'],
  ])('TC-120: rechaza "%s" (%s) con el mensaje de la política de complejidad', async (nueva) => {
    const mensajesError = await mensajes(
      dto({ nuevaContrasena: nueva, confirmarNuevaContrasena: nueva }),
    );

    expect(mensajesError.join(' ')).toContain(
      'mayúscula, una minúscula, un número y un carácter especial',
    );
  });

  it('TC-120: rechaza una nueva contraseña de menos de 8 caracteres', async () => {
    await expect(
      mensajes(dto({ nuevaContrasena: 'Nv1!', confirmarNuevaContrasena: 'Nv1!' })),
    ).resolves.not.toEqual([]);
  });

  it('TC-121: rechaza una confirmación distinta de la nueva contraseña', async () => {
    const mensajesError = await mensajes(dto({ confirmarNuevaContrasena: 'Distinta123!' }));

    expect(mensajesError).toContain('La confirmación no coincide con la nueva contraseña.');
  });

  it('exige los tres campos del formulario', async () => {
    const mensajesError = await mensajes(new CambiarContrasenaDto());

    expect(mensajesError.join(' ')).toContain('La contraseña actual es obligatoria.');
    expect(mensajesError.join(' ')).toContain('La nueva contraseña es obligatoria.');
    expect(mensajesError.join(' ')).toContain('Debes confirmar la nueva contraseña.');
  });

  it('MatchesPassword sin mensaje propio usa el mensaje por defecto', async () => {
    class SinMensaje {
      @IsString()
      origen = 'abc';

      @MatchesPassword('origen')
      copia: string;
    }

    const objeto = Object.assign(new SinMensaje(), { copia: 'xyz' });
    await expect(mensajes(objeto)).resolves.toEqual(['El valor no coincide con origen']);
  });
});
