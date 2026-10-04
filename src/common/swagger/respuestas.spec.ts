import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * DT-26 · El contrato de la API (Swagger) declara, en cada operación, su
 * respuesta exitosa y los errores que puede devolver con el formato común.
 * Arma el documento real a partir de todos los controllers, sin base de datos.
 */
describe('DT-26 · Respuestas declaradas en Swagger', () => {
  let app: INestApplication;
  let documento: OpenAPIObject;
  const operaciones: { ruta: string; verbo: string; respuestas: Record<string, any> }[] = [];

  beforeAll(async () => {
    // El CI no tiene .env: la validación del entorno corre al importar el módulo.
    process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
    process.env.JWT_SECRET ??= 'secreto-de-prueba-con-largo-suficiente';
    const { AppModule } = await import('../../app.module');
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix('api/v1');
    documento = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    for (const [ruta, item] of Object.entries(documento.paths)) {
      for (const [verbo, op] of Object.entries(item)) {
        if (op && typeof op === 'object' && 'responses' in op) {
          operaciones.push({ ruta, verbo, respuestas: op.responses as Record<string, any> });
        }
      }
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  const deNegocio = () => operaciones.filter((o) => !o.ruta.endsWith('/health'));

  it('documenta todas las operaciones de los controllers', () => {
    expect(deNegocio().length).toBeGreaterThanOrEqual(85);
  });

  it('cada operación describe su respuesta exitosa', () => {
    const sinDescripcion = deNegocio()
      .filter((o) => {
        const exito = Object.entries(o.respuestas).find(([codigo]) => codigo.startsWith('2'));
        return !exito || !exito[1].description;
      })
      .map((o) => `${o.verbo.toUpperCase()} ${o.ruta}`);
    expect(sinDescripcion).toEqual([]);
  });

  it('cada operación declara al menos un error con el formato común', () => {
    const sinErrores = deNegocio()
      .filter(
        (o) =>
          !Object.entries(o.respuestas).some(
            ([codigo, r]) =>
              /^4\d\d$/.test(codigo) &&
              r.content?.['application/json']?.schema?.$ref?.endsWith('/ErrorRespuestaDto'),
          ),
      )
      .map((o) => `${o.verbo.toUpperCase()} ${o.ruta}`);
    expect(sinErrores).toEqual([]);
  });

  it('las operaciones con rol declaran 401 y 403 (TC-091 a TC-107: cuota social)', () => {
    const configurar = operaciones.find(
      (o) => o.ruta === '/api/v1/cuota-social' && o.verbo === 'post',
    );
    expect(Object.keys(configurar!.respuestas).sort()).toEqual(['201', '400', '401', '403', '404']);
    expect(configurar!.respuestas['400'].description).toContain('Datos de entrada inválidos');
  });

  it('los mensajes reales figuran como ejemplos en la descripción del error', () => {
    const editarUsuario = operaciones.find(
      (o) => o.ruta === '/api/v1/usuarios/{id}' && o.verbo === 'patch',
    );
    expect(editarUsuario!.respuestas['404'].description).toContain('«Usuario no encontrado»');
    expect(editarUsuario!.respuestas['409'].description).toContain(
      '«Ya existe otro usuario con ese email»',
    );
  });

  it('las respuestas de auth, usuarios y alertas declaran su tipo', () => {
    const tipo = (ruta: string, verbo: string, codigo: string) => {
      const schema = operaciones.find((o) => o.ruta === ruta && o.verbo === verbo)!.respuestas[
        codigo
      ].content?.['application/json']?.schema;
      return schema?.$ref ?? schema?.items?.$ref;
    };
    expect(tipo('/api/v1/auth/me', 'get', '200')).toMatch(/PerfilRespuestaDto$/);
    expect(tipo('/api/v1/auth/login', 'post', '200')).toMatch(/SesionRespuestaDto$/);
    expect(tipo('/api/v1/usuarios', 'get', '200')).toMatch(/UsuariosPaginadosDto$/);
    expect(tipo('/api/v1/usuarios/{id}', 'get', '200')).toMatch(/UsuarioRespuestaDto$/);
    expect(tipo('/api/v1/alertas/documentacion', 'get', '200')).toMatch(/AlertaDocumentacionDto$/);
  });
});
