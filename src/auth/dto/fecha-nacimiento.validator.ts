import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

const FECHA_MINIMA = '1900-01-01';

@ValidatorConstraint({ name: 'fechaNacimientoValida', async: false })
export class FechaNacimientoValidaConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }

    const [anio, mes, dia] = value.split('-').map(Number);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia));
    const hoy = new Date();
    const fechaHoyUtc = new Date(
      Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()),
    );

    return (
      fecha.toISOString().slice(0, 10) === value && value >= FECHA_MINIMA && fecha <= fechaHoyUtc
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} debe estar entre el 01/01/1900 y el día de hoy`;
  }
}

export function IsFechaNacimientoValida(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'fechaNacimientoValida',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: FechaNacimientoValidaConstraint,
    });
  };
}
