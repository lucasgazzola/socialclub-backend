import {
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
} from 'class-validator';

/**
 * Compara un campo contra el valor de otro campo del mismo objeto.
 *
 * US-41 lo usa para exigir que `confirmarNuevaContrasena` coincida con
 * `nuevaContrasena`. class-validator (0.15) no trae un decorador `@Match`, así
 * que el equipo lo provee acá y queda disponible para cualquier otro DTO.
 */
@ValidatorConstraint({ name: 'matchPassword', async: false })
export class MatchPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [property] = args.constraints as string[];
    return value === (args.object as Record<string, unknown>)[property];
  }

  defaultMessage(args: ValidationArguments): string {
    const [property] = args.constraints as string[];
    return `El valor no coincide con ${property}`;
  }
}

/** Decorador de uso: `@MatchesPassword('nuevaContrasena', { message: '...' })`. */
export function MatchesPassword(
  property: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'matchPassword',
      target: object.constructor,
      propertyName: propertyName as string,
      constraints: [property],
      options: validationOptions,
      validator: MatchPasswordConstraint,
    });
  };
}
