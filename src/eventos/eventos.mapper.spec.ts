import { mapEventoResponse, DEFAULT_EVENT_IMAGE_URL } from './eventos.mapper';

describe('eventos.mapper', () => {
  it('retorna la imageUrl por defecto, requiereEntrada y descuentoSocio', () => {
    const raw: any = {
      id: 1,
      nombre: 'Evento Test',
      precio: 1500,
      descuentoSocio: 15,
      requiereEntrada: true,
      imagen: null,
      _count: { entradas: 5 },
    };

    const res = mapEventoResponse(raw);

    expect(res.imageUrl).toBe(DEFAULT_EVENT_IMAGE_URL);
    expect(res.precio).toBe('1500');
    expect(res.descuentoSocio).toBe(15);
    expect(res.requiereEntrada).toBe(true);
    expect(res.entradasVendidas).toBe(5);
    expect(res).not.toHaveProperty('_count');
    expect(res).not.toHaveProperty('imagen');
  });

  it('mapea correctamente eventos sin entrada requerida', () => {
    const raw: any = {
      id: 2,
      nombre: 'Evento Libre',
      requiereEntrada: false,
      precio: 0,
      descuentoSocio: 0,
      capacidadMaxima: null,
      entradasDisponibles: null,
    };

    const res = mapEventoResponse(raw);

    expect(res.requiereEntrada).toBe(false);
    expect(res.capacidadMaxima).toBeNull();
    expect(res.entradasDisponibles).toBeNull();
    expect(res.precio).toBe('0');
  });
});
